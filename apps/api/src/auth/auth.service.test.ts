import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    recruiter: { findUnique: vi.fn() },
    session: { create: vi.fn() },
  },
}));

vi.mock('@jobportal/auth', () => ({
  hashPassword: vi.fn(),
  isStrongPassword: vi.fn(),
  verifyPassword: vi.fn(),
  verifyRefreshToken: vi.fn(),
  hashJti: (jti: string) => `sha256(${jti})`,
  issueTokenPair: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword, issueTokenPair, verifyPassword } from '@jobportal/auth';
import { AuthService } from './auth.service';

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  recruiter: { findUnique: ReturnType<typeof vi.fn> };
  session: { create: ReturnType<typeof vi.fn> };
};
const mockedStrong = isStrongPassword as ReturnType<typeof vi.fn>;
const mockedHash = hashPassword as ReturnType<typeof vi.fn>;
const mockedIssue = issueTokenPair as ReturnType<typeof vi.fn>;
const mockedVerify = verifyPassword as ReturnType<typeof vi.fn>;

const validInput = {
  email: 'seeker@example.com',
  password: 'Sup3rSecret!',
  name: 'Test Seeker',
};

// Locks in the auto-login-on-registration contract (SRS §4.12): a successful
// register must mint a token pair AND persist a refresh session, so the new
// seeker lands on /onboarding already authenticated (no separate sign-in).
describe('AuthService.register (auto-login on sign-up)', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    // resetAllMocks wipes return values too — re-establish happy-path defaults.
    mockedStrong.mockReturnValue(true);
    mockedHash.mockResolvedValue('argon2-hash');
    mockedIssue.mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshJti: 'jti',
      refreshExpiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.user.create.mockResolvedValue({
      id: 7,
      email: validInput.email,
      name: validInput.name,
      role: 'CANDIDATE',
      emailVerified: false,
    });
    mocked.session.create.mockResolvedValue({ id: 1 });
    service = new AuthService();
  });

  it('returns the user + a token pair and persists a session', async () => {
    const out = await service.register(validInput, 'ua/1.0', '127.0.0.1');

    expect(out.user.id).toBe(7);
    expect(out.accessToken).toBe('access');
    expect(out.refreshToken).toBe('refresh');
    expect(mocked.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: validInput.email,
          name: validInput.name,
          passwordHash: 'argon2-hash',
          role: 'CANDIDATE',
        }),
      }),
    );
    // issueSession persisted a refresh session keyed by sha256(jti).
    expect(mocked.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 7,
          refreshTokenHash: 'sha256(jti)',
          deviceInfo: 'ua/1.0',
          ipAddress: '127.0.0.1',
        }),
      }),
    );
  });

  it('rejects a weak password before any DB write', async () => {
    mockedStrong.mockReturnValue(false);
    await expect(service.register(validInput, undefined, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mocked.user.create).not.toHaveBeenCalled();
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email without creating a user or session', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 1, email: validInput.email });
    await expect(service.register(validInput, undefined, undefined)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mocked.user.create).not.toHaveBeenCalled();
    expect(mocked.session.create).not.toHaveBeenCalled();
  });
});

// SRS §4.9 — a recruiter soft-removed from their team is blocked from
// re-authenticating. The check is scoped strictly to role === RECRUITER, so
// candidate/admin login is unaffected (byte-for-byte the old behavior).
describe('AuthService.login (deactivated-recruiter block)', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedIssue.mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshJti: 'jti',
      refreshExpiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    mockedVerify.mockResolvedValue(true);
    mocked.session.create.mockResolvedValue({ id: 1 });
    service = new AuthService();
  });

  it('a CANDIDATE login never queries the recruiter table', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'seeker@example.com',
      passwordHash: 'hash',
      role: 'CANDIDATE',
      emailVerified: true,
    });

    const out = await service.login(
      { email: 'seeker@example.com', password: 'x' },
      undefined,
      undefined,
    );

    expect(out.accessToken).toBe('access');
    expect(mocked.recruiter.findUnique).not.toHaveBeenCalled();
    expect(mocked.session.create).toHaveBeenCalled();
  });

  it('blocks a deactivated recruiter with 403 and mints no session', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 9,
      email: 'ex@acme.com',
      passwordHash: 'hash',
      role: 'RECRUITER',
      emailVerified: true,
    });
    mocked.recruiter.findUnique.mockResolvedValue({ deactivatedAt: new Date('2026-07-01') });

    await expect(
      service.login({ email: 'ex@acme.com', password: 'x' }, undefined, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  it('lets an active recruiter (deactivatedAt null) sign in', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 10,
      email: 'ok@acme.com',
      passwordHash: 'hash',
      role: 'RECRUITER',
      emailVerified: true,
    });
    mocked.recruiter.findUnique.mockResolvedValue({ deactivatedAt: null });

    const out = await service.login(
      { email: 'ok@acme.com', password: 'x' },
      undefined,
      undefined,
    );
    expect(out.accessToken).toBe('access');
    expect(mocked.session.create).toHaveBeenCalled();
  });
});
