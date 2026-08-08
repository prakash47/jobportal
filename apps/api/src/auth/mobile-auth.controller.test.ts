import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileAuthController } from './mobile-auth.controller';

// The whole point of this surface is WHERE the tokens are written, so the
// tests assert the response body — and that no Set-Cookie path is involved.

const USER = {
  id: 7,
  email: 'arjun.iyer@example.com',
  name: 'Arjun Iyer',
  role: 'CANDIDATE',
  emailVerified: false,
  passwordHash: 'argon2-secret',
};

const PAIR = { user: USER, accessToken: 'access.jwt', refreshToken: 'refresh.jwt' };

const auth = {
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
};
const emailVerify = { issueAndSend: vi.fn() };
const email = { enqueueRegistrationConfirmation: vi.fn() };

const ctrl = new MobileAuthController(auth as never, emailVerify as never, email as never);
const req = { headers: { 'user-agent': 'CQ/1.0 (Android 14)' }, ip: '203.0.113.9' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  auth.register.mockResolvedValue(PAIR);
  auth.login.mockResolvedValue(PAIR);
  auth.refresh.mockResolvedValue(PAIR);
  auth.logout.mockResolvedValue(undefined);
  emailVerify.issueAndSend.mockResolvedValue(undefined);
  email.enqueueRegistrationConfirmation.mockResolvedValue(undefined);
});

describe('POST /v1/auth/mobile/login', () => {
  it('returns the tokens in the BODY — the whole reason this surface exists', async () => {
    const out = await ctrl.login({ email: 'Arjun.Iyer@example.com', password: 'pw' }, req);
    expect(out.accessToken).toBe('access.jwt');
    expect(out.refreshToken).toBe('refresh.jwt');
    expect(out.tokenType).toBe('Bearer');
  });

  it('reports the access lifetime as a DURATION, never an absolute timestamp', async () => {
    // A wrong device clock would otherwise refresh on every call or never.
    const out = await ctrl.login({ email: 'a@b.co', password: 'pw' }, req);
    expect(out.expiresIn).toBe(900);
  });

  it('never leaks the password hash', async () => {
    const out = await ctrl.login({ email: 'a@b.co', password: 'pw' }, req);
    expect(out.user).toEqual({
      id: 7,
      email: 'arjun.iyer@example.com',
      name: 'Arjun Iyer',
      role: 'CANDIDATE',
      emailVerified: false,
    });
    expect(JSON.stringify(out)).not.toContain('argon2-secret');
  });

  it('lowercases the email through the shared DTO, exactly like the browser route', async () => {
    await ctrl.login({ email: 'Arjun.Iyer@EXAMPLE.com', password: 'pw' }, req);
    expect(auth.login).toHaveBeenCalledWith(
      { email: 'arjun.iyer@example.com', password: 'pw' },
      'CQ/1.0 (Android 14)',
      '203.0.113.9',
    );
  });

  it('rejects a malformed body with the Zod issues', async () => {
    await expect(ctrl.login({ email: 'not-an-email', password: '' }, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auth.login).not.toHaveBeenCalled();
  });
});

describe('POST /v1/auth/mobile/register', () => {
  it('returns a session so the app lands authenticated, like the web auto-login', async () => {
    const out = await ctrl.register(
      { email: 'new@example.com', password: 'pass1234!', name: 'New User' },
      req,
    );
    expect(out.accessToken).toBe('access.jwt');
    expect(out.refreshToken).toBe('refresh.jwt');
  });

  it('still returns the session when the verification email throws', async () => {
    // The account and session are already committed — an email failure must
    // never 500 and strand a created-but-"failed" account.
    emailVerify.issueAndSend.mockRejectedValue(new Error('resend down'));
    const out = await ctrl.register(
      { email: 'new@example.com', password: 'pass1234!', name: 'New User' },
      req,
    );
    expect(out.accessToken).toBe('access.jwt');
  });

  it('still returns the session when the welcome email queue rejects', async () => {
    email.enqueueRegistrationConfirmation.mockRejectedValue(new Error('redis blip'));
    await expect(
      ctrl.register({ email: 'new@example.com', password: 'pass1234!', name: 'New User' }, req),
    ).resolves.toMatchObject({ accessToken: 'access.jwt' });
  });

  it('enforces the shared password rule (digit + special, 8+)', async () => {
    await expect(
      ctrl.register({ email: 'new@example.com', password: 'password', name: 'New User' }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auth.register).not.toHaveBeenCalled();
  });
});

describe('POST /v1/auth/mobile/refresh', () => {
  it('takes the refresh token from the BODY, not a cookie', async () => {
    const out = await ctrl.refresh({ refreshToken: 'old.refresh' }, req);
    expect(auth.refresh).toHaveBeenCalledWith(
      'old.refresh',
      'CQ/1.0 (Android 14)',
      '203.0.113.9',
    );
    expect(out.refreshToken).toBe('refresh.jwt');
  });

  it('rejects a missing or empty token before touching the service', async () => {
    await expect(ctrl.refresh({}, req)).rejects.toBeInstanceOf(BadRequestException);
    await expect(ctrl.refresh({ refreshToken: '' }, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});

describe('POST /v1/auth/mobile/logout', () => {
  it('revokes the presented session', async () => {
    await ctrl.logout({ refreshToken: 'live.refresh' });
    expect(auth.logout).toHaveBeenCalledWith('live.refresh');
  });

  it('is idempotent for a garbage or missing token — never throws, never 401s', async () => {
    // A retrying client on a flaky connection must not get an error, and a 401
    // would tell an attacker whether a stolen token was still live.
    await expect(ctrl.logout({})).resolves.toBeUndefined();
    await expect(ctrl.logout({ refreshToken: '' })).resolves.toBeUndefined();
    await expect(ctrl.logout(null)).resolves.toBeUndefined();
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
