import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted above the SUT import so the module under test binds to the mocks.
vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    adminStaff: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    adminStaffInvite: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: { updateMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  Prisma: { DbNull: { __dbNull: true } },
}));
vi.mock('@jobportal/auth', () => ({ hashPassword: vi.fn(), isStrongPassword: vi.fn() }));

import { prisma, Prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminStaffService } from './admin-staff.service';

type Mock = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  user: { findUnique: Mock; create: Mock; update: Mock };
  adminStaff: { findUnique: Mock; create: Mock; update: Mock; count: Mock };
  adminStaffInvite: { findUnique: Mock; updateMany: Mock; create: Mock; update: Mock };
  session: { updateMany: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
  $queryRaw: Mock;
};
const flag = isFlagEnabled as Mock;
const mockedHash = hashPassword as Mock;
const mockedStrong = isStrongPassword as Mock;

const ROLES_FLAG = 'killswitch.admin_roles_write';
const EMAIL_FLAG = 'killswitch.transactional_emails';

const auth = { issueSession: vi.fn() };
const email = { enqueueAdminStaffInvite: vi.fn() };

const future = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

const ACTOR = 200023; // the acting super admin's User id

/** Only `key` is killswitched; everything else is off. */
function killswitch(key: string): void {
  flag.mockImplementation((k: string) => Promise.resolve(k === key));
}

/** The single diff object written by profileAuditLog.create, for assertion. */
function auditCall(n = 0): { userId: number; action: string; diff: Record<string, unknown> } {
  return db.profileAuditLog.create.mock.calls[n]?.[0].data;
}

describe('AdminStaffService', () => {
  let service: AdminStaffService;

  beforeEach(() => {
    vi.resetAllMocks();
    flag.mockResolvedValue(false);
    mockedHash.mockResolvedValue('hash');
    mockedStrong.mockReturnValue(true);
    db.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    db.$queryRaw.mockResolvedValue([]); // the FOR UPDATE lock in assertNotLastSuperAdmin
    db.profileAuditLog.create.mockResolvedValue({});
    db.adminStaffInvite.updateMany.mockResolvedValue({ count: 0 });
    db.adminStaffInvite.update.mockResolvedValue({});
    db.adminStaff.update.mockResolvedValue({});
    db.user.update.mockResolvedValue({});
    db.session.updateMany.mockResolvedValue({ count: 0 });
    email.enqueueAdminStaffInvite.mockResolvedValue(undefined);
    auth.issueSession.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });

    service = new AdminStaffService(auth as unknown as never, email as unknown as never);
  });

  // --- killswitch (L3) -----------------------------------------------------

  describe('killswitch.admin_roles_write', () => {
    beforeEach(() => killswitch(ROLES_FLAG));

    it('blocks every mutation with 503 and writes nothing', async () => {
      const calls: Promise<unknown>[] = [
        service.invite(ACTOR, { email: 'a@b.com', staffRole: 'SUPPORT_ADMIN' }),
        service.resendInvite(ACTOR, 1),
        service.revokeInvite(ACTOR, 1),
        service.updateStaff(ACTOR, 1, { staffRole: 'SUPPORT_ADMIN' }),
        service.deactivateStaff(ACTOR, 1),
        service.reactivateStaff(ACTOR, 1),
      ];
      for (const c of calls) {
        await expect(c).rejects.toBeInstanceOf(ServiceUnavailableException);
      }
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.adminStaffInvite.create).not.toHaveBeenCalled();
      expect(db.adminStaff.create).not.toHaveBeenCalled();
    });

    // Unlike every other admin killswitch in this repo, this one covers the
    // PUBLIC endpoints too — accepting an invite creates an admin account.
    it('blocks the public preview and accept endpoints too', async () => {
      await expect(service.previewInvite('tok')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        service.acceptInvite({ token: 'tok', name: 'A', password: 'x' }, undefined, undefined),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.adminStaffInvite.findUnique).not.toHaveBeenCalled();
      expect(db.user.create).not.toHaveBeenCalled();
    });
  });

  describe('killswitch.transactional_emails', () => {
    beforeEach(() => killswitch(EMAIL_FLAG));

    // The point of this pre-check: without it the invite row would be created
    // and the mail silently dropped, leaving a pending invite whose link nobody
    // will ever receive and no signal that anything went wrong.
    it('invite for a NEW address 503s before creating the row', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(
        service.invite(ACTOR, { email: 'new@b.com', staffRole: 'SUPPORT_ADMIN' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.adminStaffInvite.create).not.toHaveBeenCalled();
    });

    it('resend 503s', async () => {
      await expect(service.resendInvite(ACTOR, 1)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    // The branches that send no mail must not be blocked by the mail switch.
    it('does NOT block granting a tier to an existing admin (no email is sent)', async () => {
      db.user.findUnique.mockResolvedValue({ id: 55, role: 'ADMIN', adminStaff: null });
      db.adminStaff.create.mockResolvedValue({ id: 9 });
      await expect(
        service.invite(ACTOR, { email: 'existing@b.com', staffRole: 'FINANCE_ADMIN' }),
      ).resolves.toEqual({ status: 'granted', staffId: 9, email: 'existing@b.com' });
      expect(email.enqueueAdminStaffInvite).not.toHaveBeenCalled();
    });
  });

  // --- invite --------------------------------------------------------------

  describe('invite', () => {
    it('mints a token, supersedes prior pending invites, and mails AFTER the commit', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.adminStaffInvite.create.mockResolvedValue({
        id: 7,
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
        expiresAt: future,
        createdAt: new Date(),
      });

      const result = await service.invite(ACTOR, {
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
      });

      expect(result.status).toBe('invited');
      // Supersede-on-reinvite: the partial "one PENDING invite per email"
      // constraint Prisma cannot express as an @@unique.
      expect(db.adminStaffInvite.updateMany).toHaveBeenCalledWith({
        where: { email: 'new@b.com', acceptedAt: null, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // Only the hash is persisted; the raw token exists solely in the URL.
      const created = db.adminStaffInvite.create.mock.calls[0]?.[0].data;
      expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(created).not.toHaveProperty('token');
      // No overrides → the key is omitted entirely, so the tier defaults stay live.
      expect(created).not.toHaveProperty('permissions');
      expect(email.enqueueAdminStaffInvite).toHaveBeenCalledTimes(1);
    });

    it('never writes the raw token into the audit diff', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.adminStaffInvite.create.mockResolvedValue({
        id: 7,
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
        expiresAt: future,
        createdAt: new Date(),
      });

      await service.invite(ACTOR, { email: 'new@b.com', staffRole: 'SUPPORT_ADMIN' });

      const { userId, action, diff } = auditCall();
      expect(userId).toBe(ACTOR);
      expect(action).toBe('ADMIN_STAFF_INVITED');
      expect(diff).toEqual({ email: 'new@b.com', staffRole: 'SUPPORT_ADMIN' });
      const rawToken = db.adminStaffInvite.create.mock.calls[0]?.[0].data.tokenHash;
      expect(JSON.stringify(diff)).not.toContain(rawToken);
    });

    it('builds the invite URL with the /sadmin basePath', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.adminStaffInvite.create.mockResolvedValue({
        id: 7,
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
        expiresAt: future,
        createdAt: new Date(),
      });

      await service.invite(ACTOR, { email: 'new@b.com', staffRole: 'SUPPORT_ADMIN' });

      // SADMIN_URL is an ORIGIN and the app sets basePath '/sadmin', so the
      // prefix must be written here — the inverse of the in-app href rule.
      const payload = email.enqueueAdminStaffInvite.mock.calls[0]?.[2];
      expect(payload.inviteUrl).toContain('/sadmin/accept-invite/');
      expect(payload.inviteUrl).not.toContain('/sadmin/sadmin/');
    });

    it('a failed email enqueue does not fail the invite', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.adminStaffInvite.create.mockResolvedValue({
        id: 7,
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
        expiresAt: future,
        createdAt: new Date(),
      });
      email.enqueueAdminStaffInvite.mockRejectedValue(new Error('redis down'));

      await expect(
        service.invite(ACTOR, { email: 'new@b.com', staffRole: 'SUPPORT_ADMIN' }),
      ).resolves.toMatchObject({ status: 'invited' });
    });

    it('409s when the address is already an ACTIVE staff member', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 55,
        role: 'ADMIN',
        adminStaff: { id: 9, deactivatedAt: null },
      });
      await expect(
        service.invite(ACTOR, { email: 'staff@b.com', staffRole: 'SUPPORT_ADMIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.adminStaffInvite.create).not.toHaveBeenCalled();
    });

    it('reactivates a previously deactivated staffer in place, with no email', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 55,
        role: 'ADMIN',
        adminStaff: { id: 9, deactivatedAt: past },
      });

      const result = await service.invite(ACTOR, {
        email: 'old@b.com',
        staffRole: 'CONTENT_ADMIN',
      });

      expect(result).toEqual({ status: 'reactivated', staffId: 9, email: 'old@b.com' });
      expect(email.enqueueAdminStaffInvite).not.toHaveBeenCalled();
      expect(db.adminStaff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 9 },
          data: expect.objectContaining({ deactivatedAt: null, staffRole: 'CONTENT_ADMIN' }),
        }),
      );
      // Re-asserted so a drifted User.role cannot leave them bounced by the role
      // check that runs before the staff check.
      expect(db.user.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { role: 'ADMIN' } });
      expect(auditCall().action).toBe('ADMIN_STAFF_REACTIVATED');
    });

    // The documented normal case: CLAUDE.md §9 makes admins by direct DB write,
    // so an ADMIN with no staff row is what a hand-promotion leaves behind.
    it('grants a tier directly to an existing ADMIN that has no staff row', async () => {
      db.user.findUnique.mockResolvedValue({ id: 55, role: 'ADMIN', adminStaff: null });
      db.adminStaff.create.mockResolvedValue({ id: 9 });

      const result = await service.invite(ACTOR, {
        email: 'promoted@b.com',
        staffRole: 'FINANCE_ADMIN',
      });

      expect(result).toEqual({ status: 'granted', staffId: 9, email: 'promoted@b.com' });
      expect(email.enqueueAdminStaffInvite).not.toHaveBeenCalled();
      expect(db.adminStaff.create.mock.calls[0]?.[0].data).toMatchObject({
        userId: 55,
        staffRole: 'FINANCE_ADMIN',
        createdById: ACTOR,
      });
    });

    // Refused rather than converted: User.role is a single scalar, so promoting
    // them would change what their own account IS and strand the profile on it.
    it('409s for an address belonging to a candidate or recruiter', async () => {
      db.user.findUnique.mockResolvedValue({ id: 55, role: 'CANDIDATE', adminStaff: null });
      await expect(
        service.invite(ACTOR, { email: 'seeker@b.com', staffRole: 'SUPPORT_ADMIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.adminStaff.create).not.toHaveBeenCalled();
    });
  });

  // --- resend / revoke -----------------------------------------------------

  describe('resendInvite', () => {
    it('supersedes the old row and mints a DIFFERENT token', async () => {
      db.adminStaffInvite.findUnique
        .mockResolvedValueOnce({
          id: 7,
          email: 'new@b.com',
          staffRole: 'SUPPORT_ADMIN',
          permissions: null,
          acceptedAt: null,
          revokedAt: null,
        })
        .mockResolvedValueOnce({ acceptedAt: null, revokedAt: null }); // in-tx re-read
      db.adminStaffInvite.create.mockResolvedValue({
        id: 8,
        email: 'new@b.com',
        staffRole: 'SUPPORT_ADMIN',
        expiresAt: future,
        createdAt: new Date(),
      });

      const result = await service.resendInvite(ACTOR, 7);

      expect(result.id).toBe(8);
      expect(db.adminStaffInvite.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { revokedAt: expect.any(Date) },
      });
      expect(db.adminStaffInvite.create.mock.calls[0]?.[0].data.tokenHash).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(auditCall().action).toBe('ADMIN_STAFF_INVITE_RESENT');
      expect(email.enqueueAdminStaffInvite).toHaveBeenCalledTimes(1);
    });

    it('refuses to resend an accepted invite', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        staffRole: 'SUPPORT_ADMIN',
        permissions: null,
        acceptedAt: new Date(),
        revokedAt: null,
      });
      await expect(service.resendInvite(ACTOR, 7)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unknown invite id', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue(null);
      await expect(service.resendInvite(ACTOR, 999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revokeInvite', () => {
    it('is idempotent on an already-revoked invite', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        staffRole: 'SUPPORT_ADMIN',
        acceptedAt: null,
        revokedAt: past,
      });
      await expect(service.revokeInvite(ACTOR, 7)).resolves.toBeUndefined();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('409s on an already-accepted invite', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        staffRole: 'SUPPORT_ADMIN',
        acceptedAt: new Date(),
        revokedAt: null,
      });
      await expect(service.revokeInvite(ACTOR, 7)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // --- the lockout guards --------------------------------------------------

  describe('last-super-admin lockout', () => {
    const superAdmin = {
      id: 1,
      userId: 500,
      staffRole: 'SUPER_ADMIN',
      permissions: null,
      deactivatedAt: null,
      user: { email: 'super@b.com' },
    };

    it('refuses to deactivate the final active super admin', async () => {
      db.adminStaff.findUnique.mockResolvedValue(superAdmin);
      db.adminStaff.count.mockResolvedValue(0); // no OTHER active super admins

      await expect(service.deactivateStaff(ACTOR, 1)).rejects.toBeInstanceOf(ConflictException);
      expect(db.adminStaff.update).not.toHaveBeenCalled();
      expect(db.session.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to demote the final active super admin', async () => {
      db.adminStaff.findUnique.mockResolvedValue(superAdmin);
      db.adminStaff.count.mockResolvedValue(0);

      await expect(
        service.updateStaff(ACTOR, 1, { staffRole: 'SUPPORT_ADMIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.adminStaff.update).not.toHaveBeenCalled();
    });

    // The lock is the whole mechanism: without it two concurrent demotions both
    // read the same pre-write snapshot and both pass.
    it('takes a FOR UPDATE row lock before counting', async () => {
      db.adminStaff.findUnique.mockResolvedValue(superAdmin);
      db.adminStaff.count.mockResolvedValue(1);

      await service.deactivateStaff(ACTOR, 1);

      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = db.$queryRaw.mock.calls[0]?.[0].join('?');
      expect(sql).toContain('FOR UPDATE');
      // Postgres cannot infer the enum type from a bare literal here.
      expect(sql).toContain(`'SUPER_ADMIN'::"AdminStaffRole"`);
    });

    it('allows deactivating a super admin when another remains', async () => {
      db.adminStaff.findUnique.mockResolvedValue(superAdmin);
      db.adminStaff.count.mockResolvedValue(1);

      await expect(service.deactivateStaff(ACTOR, 1)).resolves.toBeUndefined();
      expect(db.adminStaff.update).toHaveBeenCalled();
    });

    // A sub-admin is not load-bearing for access to the console, so no lock is
    // needed and none should be taken.
    it('does not lock when the target is not a super admin', async () => {
      db.adminStaff.findUnique.mockResolvedValue({
        ...superAdmin,
        staffRole: 'SUPPORT_ADMIN',
      });
      await service.deactivateStaff(ACTOR, 1);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('self-directed changes', () => {
    // Stricter than the recruiter equivalent on purpose: there is no support
    // team here and recovery is a direct DB write.
    it('refuses to deactivate yourself', async () => {
      db.adminStaff.findUnique.mockResolvedValue({
        id: 1,
        userId: ACTOR,
        staffRole: 'SUPER_ADMIN',
        permissions: null,
        deactivatedAt: null,
        user: { email: 'me@b.com' },
      });
      await expect(service.deactivateStaff(ACTOR, 1)).rejects.toBeInstanceOf(ConflictException);
      expect(db.adminStaff.update).not.toHaveBeenCalled();
    });

    it('refuses to change your own role or permissions', async () => {
      db.adminStaff.findUnique.mockResolvedValue({
        id: 1,
        userId: ACTOR,
        staffRole: 'SUPER_ADMIN',
        permissions: null,
        deactivatedAt: null,
        user: { email: 'me@b.com' },
      });
      await expect(
        service.updateStaff(ACTOR, 1, { staffRole: 'SUPPORT_ADMIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // --- updateStaff ---------------------------------------------------------

  describe('updateStaff', () => {
    const target = {
      id: 2,
      userId: 600,
      staffRole: 'SUPPORT_ADMIN',
      permissions: null,
      deactivatedAt: null,
      user: { email: 'support@b.com' },
    };

    it('clears the override blob with DbNull when the role changes with no overrides', async () => {
      db.adminStaff.findUnique.mockResolvedValue(target);

      const result = await service.updateStaff(ACTOR, 2, { staffRole: 'FINANCE_ADMIN' });

      expect(result.staffRole).toBe('FINANCE_ADMIN');
      // Prisma.DbNull, not null — `null` on a Json column means "leave alone",
      // which would leave the OLD tier's overrides shadowing the new defaults.
      expect(db.adminStaff.update.mock.calls[0]?.[0].data.permissions).toBe(Prisma.DbNull);
      expect(auditCall().action).toBe('ADMIN_STAFF_ROLE_CHANGED');
    });

    it('records a permissions change without touching the role', async () => {
      db.adminStaff.findUnique.mockResolvedValue(target);

      await service.updateStaff(ACTOR, 2, { permissions: { finance: 'READ_ONLY' } });

      const data = db.adminStaff.update.mock.calls[0]?.[0].data;
      expect(data).not.toHaveProperty('staffRole');
      expect(auditCall().action).toBe('ADMIN_STAFF_PERMISSIONS_CHANGED');
      // Only the modules that MOVED, never the full resolved map.
      expect(Object.keys(auditCall().diff.changes as object)).toEqual(['finance']);
    });

    // clampSystem() forces `system` back to the tier default on every resolve,
    // so a blob can never widen it. The DTO rejects the key outright; this
    // asserts the resolver would swallow it even if one arrived from psql.
    it('cannot grant `system` to a sub-admin through an override', async () => {
      db.adminStaff.findUnique.mockResolvedValue(target);

      const result = await service.updateStaff(ACTOR, 2, {
        permissions: { finance: 'EDIT' },
      });

      expect(result.permissions.system).toBe('NONE');
    });

    it('404s a deactivated target', async () => {
      db.adminStaff.findUnique.mockResolvedValue({ ...target, deactivatedAt: past });
      await expect(
        service.updateStaff(ACTOR, 2, { staffRole: 'FINANCE_ADMIN' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- deactivate ----------------------------------------------------------

  it('deactivation revokes sessions in the same transaction', async () => {
    db.adminStaff.findUnique.mockResolvedValue({
      id: 2,
      userId: 600,
      staffRole: 'SUPPORT_ADMIN',
      deactivatedAt: null,
      user: { email: 'support@b.com' },
    });

    await service.deactivateStaff(ACTOR, 2);

    // apps/sadmin never calls /auth/refresh, so revoking the sessions is the
    // only revocation channel that exists.
    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 600, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(auditCall().action).toBe('ADMIN_STAFF_DEACTIVATED');
  });

  // --- previewInvite -------------------------------------------------------

  describe('previewInvite', () => {
    // All four failures are the same answer to someone holding a token: this
    // link does not work. Distinguishing them makes the endpoint an oracle.
    it.each([
      ['unknown', null],
      ['revoked', { email: 'a@b.com', staffRole: 'SUPPORT_ADMIN', acceptedAt: null, revokedAt: past, expiresAt: future }],
      ['accepted', { email: 'a@b.com', staffRole: 'SUPPORT_ADMIN', acceptedAt: past, revokedAt: null, expiresAt: future }],
      ['expired', { email: 'a@b.com', staffRole: 'SUPPORT_ADMIN', acceptedAt: null, revokedAt: null, expiresAt: past }],
    ])('returns an indistinguishable { valid: false } for %s', async (_label, row) => {
      db.adminStaffInvite.findUnique.mockResolvedValue(row);
      await expect(service.previewInvite('tok')).resolves.toEqual({ valid: false });
    });

    it('returns the email and tier for a valid token, and never the token', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue({
        email: 'a@b.com',
        staffRole: 'CONTENT_ADMIN',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: future,
      });
      const result = await service.previewInvite('tok');
      expect(result).toEqual({ valid: true, email: 'a@b.com', staffRole: 'CONTENT_ADMIN' });
      expect(JSON.stringify(result)).not.toContain('tok');
    });
  });

  // --- acceptInvite --------------------------------------------------------

  describe('acceptInvite', () => {
    const validInvite = {
      id: 7,
      email: 'new@b.com',
      staffRole: 'SUPPORT_ADMIN',
      permissions: null,
      invitedByUserId: ACTOR,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: future,
    };
    const input = { token: 'tok', name: 'New Staffer', password: 'Passw0rd!' };

    it('creates a plain ADMIN user plus the staff row, and signs them in', async () => {
      db.adminStaffInvite.findUnique
        .mockResolvedValueOnce(validInvite)
        .mockResolvedValueOnce({ acceptedAt: null, revokedAt: null, expiresAt: future });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ id: 900, email: 'new@b.com' });
      db.adminStaff.create.mockResolvedValue({ id: 12 });

      const result = await service.acceptInvite(input, 'ua', '1.2.3.4');

      // AdminStaff is a SIDECAR — eight sites compare User.role to 'ADMIN', and
      // the tier lives in the row, never in this column.
      expect(db.user.create.mock.calls[0]?.[0].data).toMatchObject({
        role: 'ADMIN',
        emailVerified: true,
      });
      expect(db.adminStaff.create.mock.calls[0]?.[0].data).toMatchObject({
        userId: 900,
        staffRole: 'SUPPORT_ADMIN',
        createdById: ACTOR,
      });
      expect(db.adminStaffInvite.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { acceptedAt: expect.any(Date) },
      });
      expect(result.staffId).toBe(12);
      expect(auth.issueSession).toHaveBeenCalledWith(
        { id: 900, email: 'new@b.com' },
        'ua',
        '1.2.3.4',
      );
    });

    it('attributes the audit row to the NEW staffer, not the inviter', async () => {
      db.adminStaffInvite.findUnique
        .mockResolvedValueOnce(validInvite)
        .mockResolvedValueOnce({ acceptedAt: null, revokedAt: null, expiresAt: future });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ id: 900, email: 'new@b.com' });
      db.adminStaff.create.mockResolvedValue({ id: 12 });

      await service.acceptInvite(input, undefined, undefined);

      // At accept time the only session in existence is the invitee's.
      expect(auditCall().userId).toBe(900);
      expect(auditCall().action).toBe('ADMIN_STAFF_INVITE_ACCEPTED');
      // The address is already on the User row; no need to duplicate it here.
      expect(auditCall().diff).toEqual({ staffRole: 'SUPPORT_ADMIN' });
    });

    // This is the assertion that protects the double-accept race. The pre-check
    // cannot close it: two requests can both pass it before either commits.
    it('re-reads the invite INSIDE the transaction and rejects a racing accept', async () => {
      db.adminStaffInvite.findUnique
        .mockResolvedValueOnce(validInvite) // pre-check passes
        .mockResolvedValueOnce({ acceptedAt: new Date(), revokedAt: null, expiresAt: future });
      db.user.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvite(input, undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.user.create).not.toHaveBeenCalled();
      expect(db.adminStaffInvite.findUnique).toHaveBeenCalledTimes(2);
    });

    it('hashes the password OUTSIDE the transaction', async () => {
      db.adminStaffInvite.findUnique
        .mockResolvedValueOnce(validInvite)
        .mockResolvedValueOnce({ acceptedAt: null, revokedAt: null, expiresAt: future });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ id: 900, email: 'new@b.com' });
      db.adminStaff.create.mockResolvedValue({ id: 12 });

      let hashedBeforeTx = false;
      db.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
        hashedBeforeTx = mockedHash.mock.calls.length === 1;
        return fn(prisma);
      });

      await service.acceptInvite(input, undefined, undefined);

      // argon2 is memory-hard and slow; inside the tx it would hold a Postgres
      // transaction open for its full duration.
      expect(hashedBeforeTx).toBe(true);
    });

    it.each([
      ['revoked', { ...validInvite, revokedAt: past }],
      ['accepted', { ...validInvite, acceptedAt: past }],
      ['expired', { ...validInvite, expiresAt: past }],
      ['unknown', null],
    ])('400s on a %s token', async (_label, row) => {
      db.adminStaffInvite.findUnique.mockResolvedValue(row);
      await expect(service.acceptInvite(input, undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.user.create).not.toHaveBeenCalled();
    });

    it('rejects a weak password before touching the token', async () => {
      mockedStrong.mockReturnValue(false);
      await expect(service.acceptInvite(input, undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.adminStaffInvite.findUnique).not.toHaveBeenCalled();
    });

    it('409s when an account already exists for the invited address', async () => {
      db.adminStaffInvite.findUnique.mockResolvedValue(validInvite);
      db.user.findUnique.mockResolvedValue({ id: 55 });
      await expect(service.acceptInvite(input, undefined, undefined)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.user.create).not.toHaveBeenCalled();
    });
  });
});
