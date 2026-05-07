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
