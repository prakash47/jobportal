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
    expect(retryAfterSeconds(400, { window: 'daily' })).toBeNull();
    expect(retryAfterSeconds(500, {})).toBeNull();
    expect(retryAfterSeconds(HttpStatus.OK, {})).toBeNull();
  });

  it('stays SILENT when it cannot know the window', () => {
    // The throttler sets its own accurate header, and PerEmailThrottleGuard
    // blocks for an hour. Guessing "60" for either is worse than saying
    // nothing: a client that honours it retries across the whole lockout.
    expect(retryAfterSeconds(429, 'ThrottlerException: Too Many Requests')).toBeNull();
    expect(retryAfterSeconds(429, 'Too many login attempts for this email')).toBeNull();
    expect(retryAfterSeconds(429, null)).toBeNull();
    expect(retryAfterSeconds(429, [1, 2])).toBeNull();
    expect(retryAfterSeconds(429, {})).toBeNull();
  });

  it('counts to the next UTC midnight for the DAILY apply-quota 429', () => {
    const now = new Date('2026-08-08T23:59:00.000Z');
    expect(retryAfterSeconds(429, { limit: 10, upgradeAvailable: false }, now)).toBe(60);

    const morning = new Date('2026-08-08T00:00:00.000Z');
    expect(retryAfterSeconds(429, { limit: 10 }, morning)).toBe(24 * 60 * 60);
  });

  it("honours the recruiter post quota's explicit daily/monthly discriminator", () => {
    // recruiter-post-quota/quota.service.ts `over()` tags the body with
    // `window`. A monthly budget told "retry in 60s" is a month of wrong.
    const now = new Date('2026-08-08T12:00:00.000Z');
    expect(retryAfterSeconds(429, { window: 'daily', limit: 3 }, now)).toBe(12 * 60 * 60);
    // 08 Aug 12:00 → 01 Sep 00:00 = 23 days + 12h
    expect(retryAfterSeconds(429, { window: 'monthly', limit: 30 }, now)).toBe(
      23 * 24 * 60 * 60 + 12 * 60 * 60,
    );
  });

  it('rolls over a month, a year and a leap day correctly', () => {
    // Date.UTC normalises overflow, so none of these need special-casing.
    expect(retryAfterSeconds(429, { window: 'daily' }, new Date('2026-12-31T23:59:00.000Z'))).toBe(60);
    expect(retryAfterSeconds(429, { window: 'monthly' }, new Date('2026-12-15T00:00:00.000Z'))).toBe(
      17 * 24 * 60 * 60,
    );
    // 2028 is a leap year — 29 Feb exists, so the next day is 01 Mar.
    expect(retryAfterSeconds(429, { window: 'daily' }, new Date('2028-02-28T23:00:00.000Z'))).toBe(
      60 * 60,
    );
    expect(retryAfterSeconds(429, { window: 'monthly' }, new Date('2028-02-28T23:00:00.000Z'))).toBe(
      24 * 60 * 60 + 60 * 60,
    );
  });

  it('never returns 0 or a negative wait', () => {
    const justBefore = new Date('2026-08-08T23:59:59.500Z');
    expect(retryAfterSeconds(429, { limit: 5 }, justBefore)).toBeGreaterThanOrEqual(1);
  });
});
