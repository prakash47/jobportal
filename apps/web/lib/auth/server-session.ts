// Server-side session reader. Reads the access_token cookie (set by /auth/login
// on the API origin via a shared parent domain in prod; in dev the API and web
// share localhost), verifies the JWT with the same secret used by
// @jobportal/api, and returns the AccessClaims (or null when missing/invalid).
// All consumers must treat null as "anon".
//
// Note: the verify call throws when JWT_ACCESS_SECRET is unset. We catch &
// treat as anon to keep cold renders working in environments where the auth
// chain isn't bootstrapped (preview deploys, e2e harnesses).

import { cookies } from 'next/headers';
import { ACCESS_COOKIE, verifyAccessToken, type AccessClaims } from '@jobportal/auth';

export async function readUserFromCookie(): Promise<AccessClaims | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}
