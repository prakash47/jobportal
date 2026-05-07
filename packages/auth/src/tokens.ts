import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { AccessClaims, RefreshClaims, TokenPair } from './types';

// Per SRS §4.12.3
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function readEnvSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function signAccessToken(claims: AccessClaims): string {
  const opts: SignOptions = { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS };
  return jwt.sign({ ...claims }, readEnvSecret('JWT_ACCESS_SECRET'), opts);
}

export function signRefreshToken(userId: number): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = randomBytes(32).toString('hex');
  const opts: SignOptions = {
    algorithm: 'HS256',
    expiresIn: REFRESH_TTL_SECONDS,
    jwtid: jti,
    subject: String(userId),
  };
  const token = jwt.sign({}, readEnvSecret('JWT_REFRESH_SECRET'), opts);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  return { token, jti, expiresAt };
}

export function verifyAccessToken(token: string): AccessClaims {
  const opts: VerifyOptions = { algorithms: ['HS256'] };
  const decoded = jwt.verify(token, readEnvSecret('JWT_ACCESS_SECRET'), opts);
  if (typeof decoded === 'string' || decoded === null) {
    throw new Error('Malformed access token payload');
  }
  return decoded as unknown as AccessClaims;
}

export type VerifiedRefresh = { userId: number; jti: string };

export function verifyRefreshToken(token: string): VerifiedRefresh {
  const opts: VerifyOptions = { algorithms: ['HS256'] };
  const decoded = jwt.verify(token, readEnvSecret('JWT_REFRESH_SECRET'), opts);
  if (typeof decoded === 'string' || decoded === null) {
    throw new Error('Malformed refresh token payload');
  }
  const claims = decoded as unknown as RefreshClaims;
  if (!claims.sub || !claims.jti) {
    throw new Error('Refresh token missing sub or jti');
  }
  return { userId: Number(claims.sub), jti: claims.jti };
}

export function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

export function issueTokenPair(claims: AccessClaims): TokenPair {
  const accessToken = signAccessToken(claims);
  const refresh = signRefreshToken(claims.sub);
  return {
    accessToken,
    refreshToken: refresh.token,
    refreshJti: refresh.jti,
    refreshExpiresAt: refresh.expiresAt,
  };
}
