import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertServerEnv } from './env';

// The boot guard that turns "sign-in silently returns you to the login form"
// into a server that refuses to start and names the missing variable.

const KEYS = ['JWT_ACCESS_SECRET', 'DATABASE_URL'] as const;

describe('assertServerEnv', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('passes when every required variable is present', () => {
    process.env.JWT_ACCESS_SECRET = 'a-secret';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/jobportal';
    expect(() => assertServerEnv()).not.toThrow();
  });

  it('names the missing variable rather than failing generically', () => {
    delete process.env.JWT_ACCESS_SECRET;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/jobportal';
    expect(() => assertServerEnv()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('reports EVERY missing variable at once, not just the first', () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.DATABASE_URL;
    // One restart per missing var is exactly the loop this guard exists to end.
    expect(() => assertServerEnv()).toThrow(/JWT_ACCESS_SECRET[\s\S]*DATABASE_URL/);
  });

  // A copied-but-unedited .env leaves `JWT_ACCESS_SECRET=` behind. Empty and
  // whitespace-only are as unusable as absent, and jwt.verify would reject them
  // downstream with a far less helpful message.
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace-only'],
  ])('treats a %s value as missing (%s)', (value) => {
    process.env.JWT_ACCESS_SECRET = value;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/jobportal';
    expect(() => assertServerEnv()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('tells the reader how to fix it, not just what broke', () => {
    delete process.env.JWT_ACCESS_SECRET;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/jobportal';
    expect(() => assertServerEnv()).toThrow(/apps\/sadmin\/\.env/);
  });
});
