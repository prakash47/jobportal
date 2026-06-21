import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
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
import { hashPassword, isStrongPassword, issueTokenPair } from '@jobportal/auth';
import { AuthService } from './auth.service';

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  session: { create: ReturnType<typeof vi.fn> };
};
const mockedStrong = isStrongPassword as ReturnType<typeof vi.fn>;
const mockedHash = hashPassword as ReturnType<typeof vi.fn>;
const mockedIssue = issueTokenPair as ReturnType<typeof vi.fn>;

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
