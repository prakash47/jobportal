// Mirror of apps/web/lib/auth/server-session.ts. Reads the access_token
// cookie set by the API's /auth/login or /auth/recruiter/register response,
// verifies the JWT with @jobportal/auth, and returns AccessClaims (or null).
//
// Cookie scope note: in dev the API at localhost:4000 sets the cookie with
// no Domain attribute, so the host alone (`localhost`) is the scope —
// localhost:3001 (apps/recruiter) sees it. In prod COOKIE_DOMAIN is set to
// `.jobportal.com` so all subdomains share.

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
