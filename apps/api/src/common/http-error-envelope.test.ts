import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { retryAfterSeconds, reasonPhrase, withEnvelope } from './http-error-envelope';

describe('reasonPhrase', () => {
  it('title-cases the Nest status name', () => {
    expect(reasonPhrase(400)).toBe('Bad Request');
    expect(reasonPhrase(401)).toBe('Unauthorized');
    expect(reasonPhrase(429)).toBe('Too Many Requests');
    expect(reasonPhrase(500)).toBe('Internal Server Error');
  });

  it('falls back for a status Nest does not name', () => {
    expect(reasonPhrase(499)).toBe('Error');
  });
});

describe('withEnvelope', () => {
  it('wraps a thrown string', () => {
    expect(withEnvelope('Verify your email before applying.', 403)).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Verify your email before applying.',
    });
  });

  it('keeps a Zod issue ARRAY intact as message — the web apps parse it for field errors', () => {
    const issues = [
      { path: ['email'], message: 'Invalid email', code: 'invalid_string' },
      { path: ['password'], message: 'Too short', code: 'too_small' },
    ];
    const out = withEnvelope(issues, 400);
    expect(out.statusCode).toBe(400);
    expect(out.error).toBe('Bad Request');
    expect(out.message).toEqual(issues);
    expect(Array.isArray(out.message)).toBe(true);
  });

  it('adds envelope keys to an object body WITHOUT disturbing its own keys', () => {
    // The real apply-quota 429 body. apps/web's ApplyButton reads
    // `upgradeAvailable` and `message` off the top level, so both must survive.
    const quota = {
      count: 10,
      limit: 10,
      unlimited: false,
      upgradeAvailable: true,
      message: 'Daily application limit reached. Upgrade your plan to apply to more jobs today.',
    };
    const out = withEnvelope(quota, 429);
    expect(out).toEqual({
      ...quota,
      statusCode: 429,
      error: 'Too Many Requests',
    });
    expect(out.upgradeAvailable).toBe(true);
    expect(out.message).toBe(quota.message);
  });

  it("does not clobber a body's own statusCode / error / message", () => {
    const body = { statusCode: 418, error: 'Custom', message: 'mine' };
    expect(withEnvelope(body, 500)).toEqual(body);
  });

  it('gives an object body with no message one derived from the status', () => {
    expect(withEnvelope({ reason: 'x' }, 404)).toEqual({
      reason: 'x',
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    });
  });

  it('handles null and undefined bodies without producing a null message', () => {
    expect(withEnvelope(null, 500).message).toBe('Internal Server Error');
    expect(withEnvelope(undefined, 500).message).toBe('Internal Server Error');
  });
});

describe('retryAfterSeconds', () => {
  it('is null for anything that is not a 429', () => {
    expect(retryAfterSeconds(400, 'nope')).toBeNull();
    expect(retryAfterSeconds(500, {})).toBeNull();
    expect(retryAfterSeconds(HttpStatus.OK, {})).toBeNull();
  });

  it('uses the throttler window for a rate-limit 429', () => {
    expect(retryAfterSeconds(429, 'ThrottlerException: Too Many Requests')).toBe(60);
  });

  it('counts to the next UTC midnight for the DAILY apply-quota 429', () => {
    // The quota is a per-day budget, so a 60s hint would send a phone into a
    // retry loop for the rest of the day.
    const now = new Date('2026-08-08T23:59:00.000Z');
    expect(retryAfterSeconds(429, { limit: 10, upgradeAvailable: false }, now)).toBe(60);

    const morning = new Date('2026-08-08T00:00:00.000Z');
    expect(retryAfterSeconds(429, { limit: 10 }, morning)).toBe(24 * 60 * 60);
  });

  it('never returns 0 or a negative wait', () => {
    const justBefore = new Date('2026-08-08T23:59:59.500Z');
    expect(retryAfterSeconds(429, { limit: 5 }, justBefore)).toBeGreaterThanOrEqual(1);
  });
});
