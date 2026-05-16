import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CookieEnv = {
  domain?: string;
  secure: boolean;
};

// Per SRS §4.12 acceptance criteria + CLAUDE.md §9: HttpOnly, Secure (in prod),
// SameSite=Lax. Refresh cookie scope is /auth so the browser only sends it on
// /auth/* — minimizes leak surface.
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  env: CookieEnv,
): void {
  const base = {
    httpOnly: true,
    secure: env.secure,
    sameSite: 'lax' as const,
    domain: env.domain || undefined,
  };
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: '/auth', maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response, env: CookieEnv): void {
  const base = {
    httpOnly: true,
    secure: env.secure,
    sameSite: 'lax' as const,
    domain: env.domain || undefined,
  };
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/auth' });
}

export function readAccessTokenCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[ACCESS_COOKIE];
}

export function readRefreshTokenCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}

export function cookieEnvFromProcess(): CookieEnv {
  // Build the object conditionally so `domain: undefined` doesn't land
  // in the result — under exactOptionalPropertyTypes: true, the field
  // type `domain?: string` rejects an explicit undefined value.
  const env: CookieEnv = {
    secure: process.env.NODE_ENV === 'production',
  };
  if (process.env.COOKIE_DOMAIN) env.domain = process.env.COOKIE_DOMAIN;
  return env;
}
