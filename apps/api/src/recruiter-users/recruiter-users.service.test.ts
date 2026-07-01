import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    recruiterInvite: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { updateMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: { DbNull: { __dbNull: true } },
}));
vi.mock('@jobportal/auth', () => ({ hashPassword: vi.fn(), isStrongPassword: vi.fn() }));

import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { RecruiterUsersService } from './recruiter-users.service';

type Mock = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  recruiter: { findUnique: Mock; findFirst: Mock; count: Mock; create: Mock; update: Mock };
  recruiterInvite: { findUnique: Mock; updateMany: Mock; create: Mock; update: Mock };
  user: { findUnique: Mock; create: Mock };
  session: { updateMany: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
};
const flag = isFlagEnabled as Mock;
const mockedHash = hashPassword as Mock;
const mockedStrong = isStrongPassword as Mock;

const auth = { issueSession: vi.fn() };
const email = { enqueueRecruiterInvite: vi.fn() };

// The caller (getCaller uses where.userId) and the target (update/remove use
// where.id) share the one recruiter.findUnique mock — dispatch on the where key.
let callerRow: Record<string, unknown>;
let targetRow: Record<string, unknown>;

const future = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

describe('RecruiterUsersService', () => {
  let service: RecruiterUsersService;

  beforeEach(() => {
    vi.resetAllMocks();
    flag.mockResolvedValue(false);
    mockedHash.mockResolvedValue('hash');
    mockedStrong.mockReturnValue(true);
    db.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    db.profileAuditLog.create.mockResolvedValue({});
    email.enqueueRecruiterInvite.mockResolvedValue(undefined);
    auth.issueSession.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });

    callerRow = {
      id: 1,
      companyId: 100,
      companyRole: 'OWNER',
      deactivatedAt: null,
      company: { name: 'Acme' },
      user: { name: 'Owner' },
    };
    targetRow = {
      id: 2,
      companyId: 100,
      companyRole: 'MEMBER',
      permissions: null,
      deactivatedAt: null,
      userId: 22,
      user: { email: 'member@acme.com' },
    };
    db.recruiter.findUnique.mockImplementation((args: { where: { userId?: number; id?: number } }) =>
      Promise.resolve(args.where.userId !== undefined ? callerRow : targetRow),
    );

    service = new RecruiterUsersService(auth as unknown as never, email as unknown as never);
  });

  // --- killswitch (L3) -----------------------------------------------------

  describe('killswitch', () => {
    beforeEach(() => flag.mockResolvedValue(true));

    it('invite → 503, no write', async () => {
      await expect(
        service.invite(1, { email: 'x@acme.com', companyRole: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.recruiterInvite.create).not.toHaveBeenCalled();
    });
    it('updateUser → 503', async () => {
      await expect(service.updateUser(1, 2, { companyRole: 'ADMIN' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
    it('removeUser → 503', async () => {
      await expect(service.removeUser(1, 2)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('revokeInvite → 503', async () => {
      await expect(service.revokeInvite(1, 9)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('acceptInvite → 503', async () => {
      await expect(
        service.acceptInvite({ token: 't', name: 'A', password: 'Sup3rSecret!' }, undefined, undefined),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('previewInvite → 503', async () => {
      await expect(service.previewInvite('t')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  // --- invite --------------------------------------------------------------

  describe('invite', () => {
    it('OWNER invites a MEMBER: supersedes prior pending, creates, audits, emails', async () => {
      db.recruiter.findFirst.mockResolvedValue(null);
      db.recruiterInvite.updateMany.mockResolvedValue({ count: 1 });
      db.recruiterInvite.create.mockResolvedValue({
        id: 5,
        email: 'new@acme.com',
        companyRole: 'MEMBER',
        expiresAt: future,
        createdAt: new Date(),
      });

      const out = await service.invite(1, { email: 'new@acme.com', companyRole: 'MEMBER' });

      expect(out.id).toBe(5);
      expect(db.recruiterInvite.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 100, email: 'new@acme.com', acceptedAt: null, revokedAt: null }),
        }),
      );
      expect(db.recruiterInvite.create).toHaveBeenCalled();
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_USER_INVITED' }) }),
      );
      expect(email.enqueueRecruiterInvite).toHaveBeenCalledWith(
        'new@acme.com',
        null,
        expect.objectContaining({ companyName: 'Acme', inviterName: 'Owner' }),
      );
    });

    it('a MEMBER cannot invite anyone (403)', async () => {
      callerRow.companyRole = 'MEMBER';
      await expect(
        service.invite(1, { email: 'x@acme.com', companyRole: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.recruiterInvite.create).not.toHaveBeenCalled();
    });

    it('an ADMIN cannot grant ADMIN (403)', async () => {
      callerRow.companyRole = 'ADMIN';
      await expect(
        service.invite(1, { email: 'x@acme.com', companyRole: 'ADMIN' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects inviting an existing active team member (409)', async () => {
      db.recruiter.findFirst.mockResolvedValue({ id: 9 });
      await expect(
        service.invite(1, { email: 'dup@acme.com', companyRole: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.recruiterInvite.create).not.toHaveBeenCalled();
    });

    it('does not fail the invite when the email backend throws (fire-and-log)', async () => {
      db.recruiter.findFirst.mockResolvedValue(null);
      db.recruiterInvite.updateMany.mockResolvedValue({ count: 0 });
      db.recruiterInvite.create.mockResolvedValue({
        id: 6,
        email: 'x@acme.com',
        companyRole: 'MEMBER',
        expiresAt: future,
        createdAt: new Date(),
      });
      email.enqueueRecruiterInvite.mockRejectedValue(new Error('Resend down'));
      await expect(
        service.invite(1, { email: 'x@acme.com', companyRole: 'MEMBER' }),
      ).resolves.toMatchObject({ id: 6 });
    });
  });

  // --- revokeInvite --------------------------------------------------------

  describe('revokeInvite', () => {
    it('404 when the invite is missing', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue(null);
      await expect(service.revokeInvite(1, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 (no leak) when the invite belongs to another company', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({
        id: 9,
        companyId: 999,
        email: 'x@x.com',
        acceptedAt: null,
        revokedAt: null,
      });
      await expect(service.revokeInvite(1, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 when the invite was already accepted', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({
        id: 9,
        companyId: 100,
        email: 'x@x.com',
        acceptedAt: new Date(),
        revokedAt: null,
      });
      await expect(service.revokeInvite(1, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('idempotent no-op when already revoked', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({
        id: 9,
        companyId: 100,
        email: 'x@x.com',
        acceptedAt: null,
        revokedAt: new Date(),
      });
      await service.revokeInvite(1, 9);
      expect(db.recruiterInvite.update).not.toHaveBeenCalled();
    });

    it('revokes a pending invite + audits', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({
        id: 9,
        companyId: 100,
        email: 'x@x.com',
        acceptedAt: null,
        revokedAt: null,
      });
      db.recruiterInvite.update.mockResolvedValue({});
      await service.revokeInvite(1, 9);
      expect(db.recruiterInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 9 }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_INVITE_REVOKED' }) }),
      );
    });
  });

  // --- updateUser ----------------------------------------------------------

  describe('updateUser', () => {
    it('404 when the target is in another company', async () => {
      targetRow.companyId = 999;
      await expect(service.updateUser(1, 2, { companyRole: 'ADMIN' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 when the target is already deactivated', async () => {
      targetRow.deactivatedAt = new Date();
      await expect(service.updateUser(1, 2, { companyRole: 'ADMIN' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('an ADMIN cannot manage another ADMIN (403)', async () => {
      callerRow.companyRole = 'ADMIN';
      targetRow.companyRole = 'ADMIN';
      await expect(service.updateUser(1, 2, { permissions: { jobs: 'NONE' } })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('an ADMIN cannot promote a MEMBER to OWNER (403)', async () => {
      callerRow.companyRole = 'ADMIN';
      await expect(service.updateUser(1, 2, { companyRole: 'OWNER' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks demoting the last OWNER (409)', async () => {
      targetRow.companyRole = 'OWNER';
      db.recruiter.count.mockResolvedValue(0); // no other owners
      await expect(service.updateUser(1, 2, { companyRole: 'MEMBER' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.recruiter.update).not.toHaveBeenCalled();
    });

    it('demotes an OWNER when another owner remains + audits ROLE_CHANGED', async () => {
      targetRow.companyRole = 'OWNER';
      db.recruiter.count.mockResolvedValue(1); // another owner exists
      db.recruiter.update.mockResolvedValue({});
      const out = await service.updateUser(1, 2, { companyRole: 'MEMBER' });
      expect(out.companyRole).toBe('MEMBER');
      expect(db.recruiter.update).toHaveBeenCalled();
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_USER_ROLE_CHANGED' }) }),
      );
    });

    it('permission-only edit on a MEMBER stores the resolved map + audits PERMISSIONS_CHANGED', async () => {
      db.recruiter.update.mockResolvedValue({});
      const out = await service.updateUser(1, 2, { permissions: { company_profile: 'EDIT' } });
      expect(out.permissions.company_profile).toBe('EDIT');
      expect(out.companyRole).toBe('MEMBER');
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_USER_PERMISSIONS_CHANGED' }) }),
      );
    });
  });

  // --- removeUser ----------------------------------------------------------

  describe('removeUser', () => {
    it('blocks self-removal (409)', async () => {
      targetRow.id = 1; // same as caller.id
      await expect(service.removeUser(1, 1)).rejects.toBeInstanceOf(ConflictException);
      expect(db.recruiter.update).not.toHaveBeenCalled();
    });

    it('404 when the target is in another company', async () => {
      targetRow.companyId = 999;
      await expect(service.removeUser(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks removing the last OWNER (409)', async () => {
      targetRow.companyRole = 'OWNER';
      db.recruiter.count.mockResolvedValue(0);
      await expect(service.removeUser(1, 2)).rejects.toBeInstanceOf(ConflictException);
    });

    it('soft-deactivates a MEMBER, revokes their sessions, audits REMOVED', async () => {
      db.recruiter.update.mockResolvedValue({});
      db.session.updateMany.mockResolvedValue({ count: 3 });
      await service.removeUser(1, 2);
      expect(db.recruiter.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ deactivatedAt: expect.any(Date) }) }),
      );
      expect(db.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 22, revokedAt: null }) }),
      );
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_USER_REMOVED' }) }),
      );
    });

    it('idempotent no-op when already deactivated', async () => {
      targetRow.deactivatedAt = new Date();
      await service.removeUser(1, 2);
      expect(db.recruiter.update).not.toHaveBeenCalled();
      expect(db.session.updateMany).not.toHaveBeenCalled();
    });
  });

  // --- acceptInvite --------------------------------------------------------

  describe('acceptInvite', () => {
    const validInvite = {
      id: 5,
      email: 'invitee@acme.com',
      companyId: 100,
      companyRole: 'MEMBER',
      permissions: null,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: future,
    };

    it('BadRequest on an unknown token', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue(null);
      await expect(
        service.acceptInvite({ token: 'nope', name: 'A', password: 'Sup3rSecret!' }, undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BadRequest on an expired token', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({ ...validInvite, expiresAt: past });
      await expect(
        service.acceptInvite({ token: 't', name: 'A', password: 'Sup3rSecret!' }, undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BadRequest on a weak password (before any token lookup)', async () => {
      mockedStrong.mockReturnValue(false);
      await expect(
        service.acceptInvite({ token: 't', name: 'A', password: 'weak' }, undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.recruiterInvite.findUnique).not.toHaveBeenCalled();
    });

    it('409 when an account with that email already exists', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue(validInvite);
      db.user.findUnique.mockResolvedValue({ id: 1 });
      await expect(
        service.acceptInvite({ token: 't', name: 'A', password: 'Sup3rSecret!' }, undefined, undefined),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.user.create).not.toHaveBeenCalled();
    });

    it('creates the user + recruiter, consumes the invite, auto-logs in', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue(validInvite);
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ id: 50, email: validInvite.email, role: 'RECRUITER' });
      db.recruiter.create.mockResolvedValue({ id: 60 });
      db.recruiterInvite.update.mockResolvedValue({});

      const out = await service.acceptInvite(
        { token: 't', name: 'Invitee', password: 'Sup3rSecret!' },
        'ua/1.0',
        '127.0.0.1',
      );

      expect(out.recruiterId).toBe(60);
      expect(out.accessToken).toBe('access');
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'RECRUITER', emailVerified: true }) }),
      );
      expect(db.recruiter.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 100, companyRole: 'MEMBER' }) }),
      );
      expect(db.recruiterInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ acceptedAt: expect.any(Date) }) }),
      );
      expect(auth.issueSession).toHaveBeenCalled();
      expect(db.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RECRUITER_INVITE_ACCEPTED' }) }),
      );
    });
  });

  // --- previewInvite -------------------------------------------------------

  describe('previewInvite', () => {
    it('returns {valid:false} for an invalid/expired token (no leak)', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue(null);
      expect(await service.previewInvite('nope')).toEqual({ valid: false });
    });

    it('returns the company + role for a valid token', async () => {
      db.recruiterInvite.findUnique.mockResolvedValue({
        email: 'invitee@acme.com',
        companyRole: 'ADMIN',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: future,
        company: { name: 'Acme' },
      });
      expect(await service.previewInvite('t')).toEqual({
        valid: true,
        email: 'invitee@acme.com',
        companyName: 'Acme',
        companyRole: 'ADMIN',
      });
    });
  });
});
