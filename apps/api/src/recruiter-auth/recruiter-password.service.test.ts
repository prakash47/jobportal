import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { updateMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  // Referenced only in a type position (`as unknown as Prisma.InputJsonValue`);
  // present so the value import resolves under the mock.
  Prisma: {},
}));
vi.mock('@jobportal/auth', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  isStrongPassword: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword, verifyPassword } from '@jobportal/auth';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { RecruiterPasswordService } from './recruiter-password.service';
import type { AuthService } from '../auth/auth.service';

const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;
const mockedStrong = isStrongPassword as unknown as ReturnType<typeof vi.fn>;
const mockedVerify = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const mockedHash = hashPassword as unknown as ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  session: { updateMany: ReturnType<typeof vi.fn> };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

// Full-ish User row (only the fields the service reads: passwordHash for verify,
// the rest carried through to issueSession untouched).
const userRow = {
  id: 42,
  email: 'priya@acme.example',
  role: 'RECRUITER',
  emailVerified: true,
  passwordHash: 'argon2-of-old',
};

const input = { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' };

describe('RecruiterPasswordService.changePassword', () => {
  let service: RecruiterPasswordService;
  let issueSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    // Defaults for the happy path — individual tests override.
    mockedFlag.mockResolvedValue(false); // killswitch OFF → feature live
    mockedStrong.mockReturnValue(true);
    mockedVerify.mockResolvedValue(true);
    mockedHash.mockResolvedValue('argon2-of-new');
    m.user.findUnique.mockResolvedValue({ ...userRow });
    m.user.update.mockResolvedValue({});
    m.session.updateMany.mockResolvedValue({ count: 3 });
    m.profileAuditLog.create.mockResolvedValue({});
    // Run the atomic block against the same mocked prisma (tx === prisma).
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));

    issueSession = vi.fn().mockResolvedValue({
      user: userRow,
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    });
    service = new RecruiterPasswordService({ issueSession } as unknown as AuthService);
  });

  it('is blocked by the killswitch (L3) before any password work', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(service.changePassword(42, input, undefined, undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mockedStrong).not.toHaveBeenCalled();
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a weak new password before touching the DB', async () => {
    mockedStrong.mockReturnValue(false);
    await expect(service.changePassword(42, input, undefined, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the new password equals the current one', async () => {
    await expect(
      service.changePassword(42, { currentPassword: 'Same1!aa', newPassword: 'Same1!aa' }, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });

  it('401s when the user row is gone', async () => {
    m.user.findUnique.mockResolvedValue(null);
    await expect(service.changePassword(42, input, undefined, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('409s for an OAuth-only account with no local password', async () => {
    m.user.findUnique.mockResolvedValue({ ...userRow, passwordHash: null });
    await expect(service.changePassword(42, input, undefined, undefined)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockedVerify).not.toHaveBeenCalled();
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password (no write)', async () => {
    mockedVerify.mockResolvedValue(false);
    await expect(service.changePassword(42, input, undefined, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockedVerify).toHaveBeenCalledWith('OldPass1!', 'argon2-of-old');
    expect(m.$transaction).not.toHaveBeenCalled();
    expect(mockedHash).not.toHaveBeenCalled();
  });

  it('happy path: sets new hash, revokes all sessions, audits, and re-mints the current session', async () => {
    const out = await service.changePassword(42, input, 'ua/1.0', '127.0.0.1');

    // New hash written.
    expect(mockedHash).toHaveBeenCalledWith('NewPass1!');
    expect(m.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { passwordHash: 'argon2-of-new' },
    });

    // Every active session revoked (incl. the requester's own).
    expect(m.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    // Audit row written — action set, and NO password material in the diff.
    const auditArgs = m.profileAuditLog.create.mock.calls[0]?.[0];
    expect(auditArgs.data.userId).toBe(42);
    expect(auditArgs.data.action).toBe('RECRUITER_PASSWORD_CHANGE');
    expect(auditArgs.data.diff).toEqual({ sessionsRevoked: 3 });
    expect(JSON.stringify(auditArgs.data.diff)).not.toContain('NewPass1!');
    expect(JSON.stringify(auditArgs.data.diff)).not.toContain('argon2-of-new');

    // Fresh session minted for THIS device; its tokens are returned to the caller.
    expect(issueSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      'ua/1.0',
      '127.0.0.1',
    );
    expect(out).toEqual({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
  });

  it('re-mints the session only after the atomic block commits', async () => {
    const order: string[] = [];
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      order.push('tx');
      return fn(prisma);
    });
    issueSession.mockImplementation(async () => {
      order.push('issueSession');
      return { user: userRow, accessToken: 'fresh-access', refreshToken: 'fresh-refresh' };
    });
    await service.changePassword(42, input, undefined, undefined);
    expect(order).toEqual(['tx', 'issueSession']);
  });
});
