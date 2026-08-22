// Server-side guard for /admin/* routes. Calls readUserFromCookie() and
// 404s on:
//   1. No session (anon) — same shape as a non-existent route, no leak.
//   2. Authed but role !== ADMIN — same 404 so a candidate with the URL
//      can't tell whether /admin exists.
//   3. Staff who are not SUPER_ADMIN — see below.
//
// Returning notFound() instead of redirect-to-login is deliberate: per
// SRS §4.16, the admin console URL is not advertised, and a 302 to
// /login would prove the route exists. The handful of legitimate
// admins know the URL.
//
// ── Why SUPER_ADMIN and not merely "is staff" (SRS §4.16) ───────────────────
//
// This subtree is the LAST remaining part of the original admin console inside
// the public seeker app — feature-flags, audit-log and kyc-review — and the
// planned feature/sadmin-admin-migration deletes it once those pages move to
// /sadmin. Until that lands it is a live privilege-escalation window, because
// `role === 'ADMIN'` is now true of every staff tier, and /admin/feature-flags
// is the KILLSWITCH CONSOLE.
//
// Concretely: without this check, the first Support Admin created by the new
// Roles & Permissions feature could open /admin/feature-flags and switch off
// killswitch.admin_broadcast_send, moderation.reports.enabled, or any other
// gate — including the ones that constrain the other staff tiers. Every scope
// in the model would become decorative, defeated from the one console nobody
// remembered was still there.
//
// The check is deliberately a DIRECT staffRole comparison rather than the
// `system` scope used elsewhere: apps/web has no other staff-aware code, no
// scope-map, and no reason to grow one for a subtree that is scheduled for
// deletion. Adding the full taxonomy here would be building infrastructure with
// a known expiry date. When the migration lands, this file goes with it.

import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';
import { readUserFromCookie } from './server-session';

export async function requireAdmin(): Promise<AccessClaims> {
  const user = await readUserFromCookie();
  if (!user || user.role !== 'ADMIN') notFound();

  // Fail-closed on a missing row, matching AdminGuard and requireAdminStaff():
  // an account promoted by a bare `UPDATE "User" SET role='ADMIN'` (which is how
  // CLAUDE.md §9 says admins are made) holds no powers until a tier is granted.
  const staff = await prisma.adminStaff.findUnique({
    where: { userId: user.sub },
    select: { staffRole: true, deactivatedAt: true },
  });
  if (!staff || staff.deactivatedAt !== null || staff.staffRole !== 'SUPER_ADMIN') notFound();

  return user;
}
