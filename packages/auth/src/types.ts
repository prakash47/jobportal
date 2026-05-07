import type { UserRole } from '@jobportal/db';

export type AccessClaims = {
  sub: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
};

export type RefreshClaims = {
  sub: string;
  jti: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  refreshExpiresAt: Date;
};

export type AuthCookieOptions = {
  domain?: string;
  secure: boolean;
};
