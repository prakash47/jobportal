import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonWebTokenError, NotBeforeError, TokenExpiredError } from '@jobportal/auth';

// The regression suite for the bug that sent a teammate back to the sign-in form
// after a SUCCESSFUL sign-in: verifyAccessToken threw 'JWT_ACCESS_SECRET is not
// set', a bare `catch { return null }` reported that as "anonymous", and
// requireSuperAdmin() redirected to /login with nothing logged anywhere.
//
// The contract under test is a single question — CAN A FRESH SIGN-IN FIX IT?
// If yes the caller is genuinely signed out (null). If no, this server cannot
// authenticate anyone and must say so (throw) instead of looping them.

const cookieGet = vi.fn<(name: string) => { value: string } | undefined>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

// Real error classes, controllable verify. Signing a genuinely expired or
// not-yet-valid token is impossible through @jobportal/auth's fixed-TTL helpers,
// and apps/sadmin has no jsonwebtoken dependency of its own to craft one with.
const verifyAccessToken = vi.fn();
vi.mock('@jobportal/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@jobportal/auth')>()),
  verifyAccessToken: (token: string) => verifyAccessToken(token) as unknown,
}));

const { readUserFromCookie } = await import('./server-session');

const CLAIMS = { sub: 1, email: 'admin@careerqueue.in', role: 'ADMIN' };

describe('readUserFromCookie', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cookieGet.mockReset().mockReturnValue({ value: 'a.token.value' });
    verifyAccessToken.mockReset().mockReturnValue(CLAIMS);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('returns the claims for a valid token', async () => {
    await expect(readUserFromCookie()).resolves.toEqual(CLAIMS);
  });

  it('returns null when no cookie is present, without calling verify', async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(readUserFromCookie()).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  // ── Genuinely signed out: a fresh sign-in fixes it, so null + redirect is honest.

  it('treats an expired token as signed out, silently', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new TokenExpiredError('jwt expired', new Date());
    });
    await expect(readUserFromCookie()).resolves.toBeNull();
    // The portal wires no refresh, so every session ends this way. Logging it
    // would make the normal case the noisiest line in the terminal.
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('treats a not-yet-valid token as signed out rather than erroring', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new NotBeforeError('jwt not active', new Date());
    });
    // Clock skew must not 500 the console's entry point.
    await expect(readUserFromCookie()).resolves.toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('treats a bad signature as signed out but names the likely cause', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new JsonWebTokenError('invalid signature');
    });
    // Indistinguishable from a forgery, so it CANNOT throw — but on a real
    // sign-in it means apps/sadmin and apps/api hold different secrets, and the
    // warning is the only thing that makes that diagnosable.
    await expect(readUserFromCookie()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('treats a verified-but-malformed payload as signed out, loudly', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('Malformed access token payload');
    });
    // Only reachable after jwt.verify() SUCCEEDED, so our own signer emitted it
    // and no attacker can trigger it — but a fresh sign-in still clears it.
    await expect(readUserFromCookie()).resolves.toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  // ── The bug. No sign-in can ever succeed here, so a redirect to /login is a lie.

  it('RETHROWS a missing JWT_ACCESS_SECRET instead of reporting "anonymous"', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('JWT_ACCESS_SECRET is not set');
    });
    await expect(readUserFromCookie()).rejects.toThrow('JWT_ACCESS_SECRET is not set');
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toMatch(/misconfigured/);
  });

  it('rethrows any unrecognised failure rather than degrading to signed out', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new TypeError('something nobody anticipated');
    });
    await expect(readUserFromCookie()).rejects.toThrow('something nobody anticipated');
  });
});
