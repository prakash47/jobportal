import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hashJti,
  issueTokenPair,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-vitest';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-vitest';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('signAccessToken + verifyAccessToken', () => {
  it('roundtrips claims', () => {
    const token = signAccessToken({
      sub: 42,
      email: 'a@b.com',
      role: 'CANDIDATE',
      emailVerified: true,
    });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(42);
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.role).toBe('CANDIDATE');
    expect(decoded.emailVerified).toBe(true);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 1, email: 'x@y.com', role: 'ADMIN', emailVerified: true });
    const tampered = `${token.slice(0, -2)}XX`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken({ sub: 1, email: 'x@y.com', role: 'ADMIN', emailVerified: true });
    process.env.JWT_ACCESS_SECRET = 'different-secret';
    expect(() => verifyAccessToken(token)).toThrow();
  });
});

describe('signRefreshToken + verifyRefreshToken', () => {
  it('roundtrips userId and jti', () => {
    const { token, jti } = signRefreshToken(7);
    const verified = verifyRefreshToken(token);
    expect(verified.userId).toBe(7);
    expect(verified.jti).toBe(jti);
  });

  it('produces a unique jti per call', () => {
    const a = signRefreshToken(7);
    const b = signRefreshToken(7);
    expect(a.jti).not.toBe(b.jti);
  });
});

describe('hashJti', () => {
  it('is deterministic', () => {
    expect(hashJti('abc')).toBe(hashJti('abc'));
  });

  it('returns 64-char hex (sha256)', () => {
    expect(hashJti('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('issueTokenPair', () => {
  it('returns four fields', () => {
    const pair = issueTokenPair({ sub: 1, email: 'a@b.com', role: 'CANDIDATE', emailVerified: false });
    expect(typeof pair.accessToken).toBe('string');
    expect(typeof pair.refreshToken).toBe('string');
    expect(typeof pair.refreshJti).toBe('string');
    expect(pair.refreshExpiresAt).toBeInstanceOf(Date);
  });
});
