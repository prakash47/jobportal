import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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

  // The gate lives in issueSession, not login(), because login() is no longer
  // the only way to obtain cookies: Google OAuth and the password-reset flow
  // both call issueSession directly and would otherwise hand a removed
  // recruiter a working session — which matters because the recruiter
  // jobs/applicants controllers authorise on the JWT role claim and never
  // re-check deactivatedAt.
  it('blocks a deactivated recruiter at issueSession, whatever the entry point', async () => {
    mocked.recruiter.findUnique.mockResolvedValue({ deactivatedAt: new Date('2026-07-01') });
    await expect(
      service.issueSession(
        {
          id: 9,
          email: 'ex@acme.com',
          role: 'RECRUITER',
          emailVerified: true,
        } as never,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  it('does not query the recruiter table for a candidate', async () => {
    mockedIssue.mockReturnValue({
      accessToken: 'a',
      refreshToken: 'r',
      refreshJti: 'j',
      refreshExpiresAt: new Date(),
    });
    await service.issueSession(
      { id: 11, email: 'c@x.com', role: 'CANDIDATE', emailVerified: true } as never,
      undefined,
      undefined,
    );
    expect(mocked.recruiter.findUnique).not.toHaveBeenCalled();
    expect(mocked.session.create).toHaveBeenCalledOnce();
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

// The Super Admin portal's sign-in (apps/sadmin). The property that matters is
// that a correct password for a NON-admin mints nothing at all: /auth/login is
// deliberately role-agnostic, so without this endpoint a candidate posting to
// the admin form would walk away with a valid session on the admin origin.
describe('AuthService.adminLogin (ADMIN-only sign-in)', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedIssue.mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshJti: 'jti',
      refreshExpiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    mockedHash.mockResolvedValue('dummy-hash');
    mockedVerify.mockResolvedValue(true);
    mocked.session.create.mockResolvedValue({ id: 1 });
    service = new AuthService();
  });

  it('signs in an ADMIN and persists a session', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@careerqueue.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      emailVerified: true,
    });

    const out = await service.adminLogin(
      { email: 'admin@careerqueue.in', password: 'Admin@123' },
      undefined,
      undefined,
    );

    expect(out.accessToken).toBe('access');
    expect(mocked.session.create).toHaveBeenCalled();
  });

  // The core guarantee. A valid CANDIDATE credential must not yield a session.
  it('rejects a CANDIDATE with a CORRECT password and mints no session', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'seeker@example.com',
      passwordHash: 'hash',
      role: 'CANDIDATE',
      emailVerified: true,
    });

    await expect(
      service.adminLogin({ email: 'seeker@example.com', password: 'correct' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  it('rejects a RECRUITER with a CORRECT password and mints no session', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 9,
      email: 'priya@nimbus.example',
      passwordHash: 'hash',
      role: 'RECRUITER',
      emailVerified: true,
    });

    await expect(
      service.adminLogin({ email: 'priya@nimbus.example', password: 'correct' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  // Ordering guard. The role must be inspected only AFTER the password has been
  // checked — inspecting it first would answer "is this address an admin?" for
  // anyone who can send a request, without knowing any credential.
  it('verifies the password BEFORE inspecting the role (no enumeration oracle)', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'seeker@example.com',
      passwordHash: 'hash',
      role: 'CANDIDATE',
      emailVerified: true,
    });

    await expect(
      service.adminLogin({ email: 'seeker@example.com', password: 'correct' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedVerify).toHaveBeenCalled();
  });

  // ...and the message must be indistinguishable from a wrong password, or the
  // response body becomes the oracle instead of the timing.
  it('uses the same generic message for a non-admin as for a bad password', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'seeker@example.com',
      passwordHash: 'hash',
      role: 'CANDIDATE',
      emailVerified: true,
    });
    const nonAdmin = await service
      .adminLogin({ email: 'seeker@example.com', password: 'correct' }, undefined, undefined)
      .catch((e: Error) => e.message);

    vi.clearAllMocks();
    mockedVerify.mockResolvedValue(false);
    mocked.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@careerqueue.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      emailVerified: true,
    });
    const badPassword = await service
      .adminLogin({ email: 'admin@careerqueue.in', password: 'wrong' }, undefined, undefined)
      .catch((e: Error) => e.message);

    expect(nonAdmin).toBe(badPassword);
  });

  it('rejects a real ADMIN with the wrong password', async () => {
    mockedVerify.mockResolvedValue(false);
    mocked.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@careerqueue.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      emailVerified: true,
    });

    await expect(
      service.adminLogin({ email: 'admin@careerqueue.in', password: 'wrong' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown email (still runs the dummy-hash timing path)', async () => {
    mocked.user.findUnique.mockResolvedValue(null);

    await expect(
      service.adminLogin({ email: 'nobody@example.com', password: 'x' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The dummy hash is produced via hashPassword so the no-such-user branch
    // costs the same as a real verify.
    expect(mockedHash).toHaveBeenCalled();
    expect(mocked.session.create).not.toHaveBeenCalled();
  });

  // An OAuth-only admin has passwordHash === null; password login must never
  // succeed for them even with the "right" password.
  it('rejects an OAuth-only ADMIN (passwordHash null)', async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: 2,
      email: 'oauth-admin@careerqueue.in',
      passwordHash: null,
      role: 'ADMIN',
      emailVerified: true,
    });

    await expect(
      service.adminLogin({ email: 'oauth-admin@careerqueue.in', password: 'x' }, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocked.session.create).not.toHaveBeenCalled();
  });
});
