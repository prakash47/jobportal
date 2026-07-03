import { cache } from 'react';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from './server-session';

export interface HeaderSessionUser {
  name: string;
  email: string;
  role: string;
}

// Server-side resolution of the signed-in user for the shared site header.
// `React.cache` dedupes the work within a single request (both the brand-link
// href and the auth actions need it). Returns null for anon.
//
// This is the SAME cookie + JWT path the dashboard shell uses, so the public
// header and the dashboard can never disagree about auth state — which was the
// bug: the header resolved auth on the client (GET /auth/me) and flashed
// "Sign in / Register" for a signed-in seeker on /jobs, /job/[slug], etc. The
// name is a light indexed PK lookup, only for signed-in users; anon returns
// early with no query. Pages using the header are already dynamic, so this adds
// no static-rendering penalty.
export const getHeaderUser = cache(async (): Promise<HeaderSessionUser | null> => {
  const claims = await readUserFromCookie();
  if (!claims) return null;
  const row = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { name: true },
  });
  const name = row?.name?.trim() ? row.name : claims.email;
  return { name, email: claims.email, role: String(claims.role) };
});
