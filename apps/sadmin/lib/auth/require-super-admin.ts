// Server gate for every page in the (authed) group. Three checks now:
//   1. Anonymous                → /login?next=<original-path>
//   2. Authed, role != ADMIN    → /login?denied=1
//   3. ADMIN, but no active staff row, or lacking the module scope → notFound()
//
// This is Layer 2 and, for this portal, it is load-bearing rather than cosmetic
// — which is unusual, and worth understanding before touching it. CLAUDE.md §4
// says UI gating is never the trust boundary, and for every WRITE in this
// console that holds: they all go through apps/api and AdminGuard. But the READS
// do not. 24 modules under lib/ query Postgres directly from the RSC per the
// repo's reads/writes split, so for the revenue ledger and the candidate PII
// screens there is no API call for AdminGuard to protect. See lib/roles/scope-map.ts.
//
// Why the role check is not optional: the access_token cookie is shared across
// all four portals on localhost (and across subdomains in prod via
// COOKIE_DOMAIN), so a signed-in candidate or recruiter arrives here already
// holding a perfectly valid token. "Is there a session" would admit all of them.
//
// Why redirect() and not notFound() for 1 and 2: apps/web's requireAdmin() 404s
// on purpose, so that a candidate who guesses /admin cannot confirm the route
// exists inside the public seeker app. That reasoning does not transfer — this
// is a dedicated origin whose whole purpose is announced by its hostname, and it
// has its own sign-in page, so a 404 would simply strand a legitimate admin who
// let their 15-minute access token expire.
//
// Why notFound() and NOT redirect() for 3: the caller is a legitimate, signed-in
// staff member. Bouncing them to /login would tell them to fix an authentication
// problem they do not have, and — because their session is valid — /login would
// send them straight back, which is an infinite loop. A 404 says "not your
// console" without pretending they are signed out.

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';
import {
  hasAdminScope,
  resolveAdminPermissions,
  type AdminAccessLevel,
  type AdminModule,
  type AdminPermissionMap,
} from '@jobportal/domain/admin-permissions';
import type { AdminStaffRole } from '@jobportal/db';
import { readUserFromCookie } from './server-session';

export type AdminStaffSession = {
  user: AccessClaims;
  staffRole: AdminStaffRole;
  permissions: AdminPermissionMap;
};

/**
 * The coarse gate: signed in, ADMIN, and holding an ACTIVE staff row.
 *
 * Used by the (authed) layout so every page in the group is covered even if a
 * new one forgets its own scope call, and returned so the layout can pass the
 * resolved permission map down to the nav without a second query.
 *
 * The staff row is read here rather than trusted from the token for the same
 * reason AdminGuard reads it: this portal never calls /auth/refresh, so a
 * privilege baked into the 15-minute access token could not be revoked at all
 * before it expired. One indexed read on a unique key makes revocation take
 * effect on the staffer's next navigation.
 */
export async function requireAdminStaff(): Promise<AdminStaffSession> {
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

  const row = await prisma.adminStaff.findUnique({
    where: { userId: user.sub },
    select: { staffRole: true, permissions: true, deactivatedAt: true },
  });

  // No row, or deactivated. Fail-closed and deliberately NOT "legacy admin, let
  // them in": CLAUDE.md §9 makes admins with a bare UPDATE on User.role, so an
  // account in exactly this state is the normal result of a hand-promotion and
  // must hold no powers until a tier is granted. `denied=1` rather than 404
  // because, unlike a scope miss, this person has no staff standing at all —
  // the same category as a recruiter arriving on the shared cookie.
  if (!row || row.deactivatedAt !== null) {
    redirect('/login?denied=1');
  }

  return {
    user,
    staffRole: row.staffRole,
    permissions: resolveAdminPermissions(row.staffRole, row.permissions),
  };
}

/**
 * The per-page gate: everything requireAdminStaff() checks, plus one module.
 *
 * Every page under app/(authed)/ calls this with the scope its route segment
 * declares in lib/roles/scope-map.ts, and scope-map.test.ts fails the build if a
 * segment is missing from that map. Pass a level HIGHER than the segment floor
 * for a page that needs more; the map is the floor, not the ceiling.
 */
export async function requireAdminScope(
  module: AdminModule,
  level: AdminAccessLevel,
): Promise<AdminStaffSession> {
  const session = await requireAdminStaff();
  if (!hasAdminScope(session.permissions, module, level)) {
    notFound();
  }
  return session;
}

/**
 * Back-compat alias.
 *
 * Kept so the name that appears in a dozen comments across middleware.ts,
 * env.ts, admin-api.ts and LoginForm.tsx still resolves to something real, and
 * so a page that has not yet been given a scope is not silently ungated. It is
 * exactly requireAdminStaff() — coarse, no module — and new pages should call
 * requireAdminScope() instead.
 */
export const requireSuperAdmin = requireAdminStaff;
