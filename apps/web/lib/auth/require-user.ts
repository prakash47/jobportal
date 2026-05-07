// Server-side auth gate for /profile/* routes. Calls readUserFromCookie() and
// redirects to /login?next=<current-path> when no session is present so the
// user lands back on the same profile page after authenticating. Pages call
// this in their server component before any data fetch.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { AccessClaims } from '@jobportal/auth';
import { readUserFromCookie } from './server-session';

export async function requireUser(): Promise<AccessClaims> {
  const user = await readUserFromCookie();
  if (user) return user;

  // The middleware sets x-canonical-pathname (+ search) on every request so
  // we can compose a same-origin ?next= back to where the user was headed.
  const h = await headers();
  const path = h.get('x-canonical-pathname') ?? '/profile';
  const search = h.get('x-canonical-search') ?? '';
  const next = encodeURIComponent(`${path}${search}`);
  redirect(`/login?next=${next}`);
}
