// Mirror of apps/recruiter/lib/auth/server-session.ts. Reads the access_token
// cookie set by the API's /auth/admin/login response, verifies the JWT with
// @jobportal/auth, and returns AccessClaims (or null).
//
// Cookie scope note — important for this portal specifically: in dev the API at
// localhost:4000 sets the cookie with no Domain attribute, so the scope is the
// HOST alone ('localhost'). Cookies are not port-scoped, so :3003 sees exactly
// the same cookie as :3000 (seeker) and :3001 (recruiter). A recruiter who is
// signed in elsewhere therefore arrives here already carrying a valid token —
// which is precisely why requireSuperAdmin() must check the ROLE and never
// merely "is there a session". In prod COOKIE_DOMAIN is set to a shared parent
// so all subdomains share the jar in the same way.
//
// A missing JWT_ACCESS_SECRET makes verifyAccessToken throw, and the catch below
// turns that into "anonymous" rather than an error — so a portal that suddenly
// treats everyone as signed-out usually means this app's .env is missing.

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
