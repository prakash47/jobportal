// @jobportal/auth — JWT (HS256) and Argon2id helpers (SRS §4.12 / §5.2).

export type { AccessClaims, RefreshClaims, TokenPair, AuthCookieOptions } from './types';
export { hashPassword, isStrongPassword, verifyPassword } from './password';
export {
  hashJti,
  issueTokenPair,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type VerifiedRefresh,
} from './tokens';

// Re-exported so a consumer can CLASSIFY a verify failure without taking its own
// dependency on jsonwebtoken (apps/sadmin has none, and adding a top-level dep to
// tell two error shapes apart would be the wrong trade — CLAUDE.md §12).
//
// The distinction these enable is load-bearing: verifyAccessToken throws both for
// "this token is bad" (the caller is simply signed out) and for "JWT_ACCESS_SECRET
// is not set" (nobody can EVER sign in here). Collapsing the two into `null` is
// what made a missing apps/sadmin/.env present itself as an unexplained bounce
// back to the login form. Only the first family is a jsonwebtoken error.
export { JsonWebTokenError, NotBeforeError, TokenExpiredError } from 'jsonwebtoken';
export {
  ACCESS_COOKIE,
  clearAuthCookies,
  cookieEnvFromProcess,
  type CookieEnv,
  readAccessTokenCookie,
  readRefreshTokenCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './cookies';
