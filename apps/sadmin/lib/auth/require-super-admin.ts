// Server gate for every page in the (authed) group. Two checks:
//   1. Anonymous            → /login?next=<original-path>
//   2. Authed, role!=ADMIN  → /login?denied=1
//
// This is Layer 2 and, for the read-only dashboard, the load-bearing one: the
// KPI figures are read straight from Postgres in the RSC per the repo's
// reads/writes split, so there is no API call for AdminGuard (Layer 3) to
// protect. Anything this portal ever WRITES must go through apps/api, where
// AdminGuard is the real trust boundary (CLAUDE.md §4 — UI gating is never it).
//
// Why the role check is not optional: the access_token cookie is shared across
// all four portals on localhost (and across subdomains in prod via
// COOKIE_DOMAIN), so a signed-in candidate or recruiter arrives here already
// holding a perfectly valid token. "Is there a session" would admit all of them.
//
// Why redirect() and not notFound(): apps/web's requireAdmin() 404s on purpose,
// so that a candidate who guesses /admin cannot confirm the route exists inside
// the public seeker app. That reasoning does not transfer — this is a dedicated
// origin whose whole purpose is announced by its hostname, and it has its own
// sign-in page, so a 404 would simply strand a legitimate admin who let their
// 15-minute access token expire.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AccessClaims } from '@jobportal/auth';
import { readUserFromCookie } from './server-session';

export async function requireSuperAdmin(): Promise<AccessClaims> {
  const user = await readUserFromCookie();

  if (!user) {
    const h = await headers();
    // Middleware forwards these already basePath-stripped, so `next` stays
    // basePath-relative and router.push() re-applies the prefix exactly once.
    const path = h.get('x-canonical-pathname') ?? '/dashboard';
    const search = h.get('x-canonical-search') ?? '';
    redirect(`/login?next=${encodeURIComponent(`${path}${search}`)}`);
  }

  if (user.role !== 'ADMIN') {
    // Signed in as someone real, just not an admin — most often a recruiter or
    // candidate whose session was picked up from the shared cookie jar. Say so
    // on the login page rather than bouncing them to a form they appear to be
    // "already signed in" for. This discloses nothing they don't already know:
    // they are authenticated as themselves.
    redirect('/login?denied=1');
  }

  return user;
}
