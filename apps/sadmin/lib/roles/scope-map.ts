// SRS §4.16 — which staff scope each /sadmin route segment requires.
//
// ── Why this file exists at all ─────────────────────────────────────────────
//
// CLAUDE.md §4 says the API layer is the only trusted enforcement point, and for
// every WRITE in this console that remains true — they all go through apps/api,
// where AdminGuard is non-bypassable. But this portal's READS do not go through
// apps/api at all. 24 modules under apps/sadmin/lib import @jobportal/db and
// query Postgres directly from the RSC, which is the repo's deliberate
// reads/writes split (ARCHITECTURE.md), and it means AdminGuard never sees them.
//
// The two most sensitive screens in the product are on that side of the line:
// lib/transactions/queries.ts aggregates the entire revenue ledger, and
// lib/candidates/queries.ts reads email, phone, expected salary, application
// history and live login sessions. Scoping only the API would produce a Finance
// Admin who cannot export the ledger but can read every rupee of it on screen,
// and a Content Admin who can browse every candidate's phone number — which is
// the precise inverse of what "role-based access control" is being asked for.
//
// So Layer 2 carries real weight here. This map is the single place that weight
// is written down, and scope-map.test.ts fails the build if a route segment
// under app/(authed)/ is missing from it. That test is the enforcement: the
// repo has no CI and no working `pnpm lint`, so a build failure is the only
// mechanism available that a person cannot forget to run.
//
// ── The rule for adding a route ─────────────────────────────────────────────
// 1. Add its segment here.
// 2. Call requireAdminScope(...) at the top of its page component.
// Skipping (1) fails the test. Skipping (2) fails nothing automatically — which
// is why (1) exists: the map is the checklist that makes the omission visible.

import type { AdminAccessLevel, AdminModule } from '@jobportal/domain/admin-permissions';

/**
 * `ANY_STAFF` = reachable by anyone holding an active AdminStaff row, whatever
 * their tier. Used only for the dashboard, which is the landing page every
 * staff member is redirected to after sign-in: gating it on a module would
 * bounce a Support Admin off the first screen they ever see. The dashboard's
 * individual KPI cards are filtered by their own module scope instead, so the
 * page renders for everyone while showing each person only their own domain.
 */
export type RouteScope = 'ANY_STAFF' | { module: AdminModule; level: AdminAccessLevel };

/**
 * Keyed by the FIRST path segment under app/(authed)/.
 *
 * Deliberately segment-level rather than per-page: a detail page invariably
 * needs at least what its list page needs, and a map with 22 entries would drift
 * from a directory with 22 entries the first time someone added a `/new` route.
 * Where a specific page needs MORE than its segment's floor (a destructive
 * action, say), it calls requireAdminScope() with the higher level directly —
 * the map is the floor, not the ceiling.
 */
export const ROUTE_SCOPES: Record<string, RouteScope> = {
  dashboard: 'ANY_STAFF',

  // Moderation: the review queue, the master posting list, and user-raised
  // reports. READ_ONLY to look; the decisions themselves are API writes that
  // AdminGuard independently requires moderation/EDIT for.
  jobs: { module: 'moderation', level: 'READ_ONLY' },
  'job-postings': { module: 'moderation', level: 'READ_ONLY' },
  reports: { module: 'moderation', level: 'READ_ONLY' },

  // The PII-dense consoles. `users` rather than a per-audience split because
  // the harm is the same shape on both sides and a Support Admin needs the
  // employer record for the same reason they need the candidate one.
  employers: { module: 'users', level: 'READ_ONLY' },
  candidates: { module: 'users', level: 'READ_ONLY' },

  // Money. Both screens read the ledger directly in their RSCs, so this entry
  // is the ONLY thing standing between a non-finance staffer and every
  // company's payment history — AdminGuard sees neither page.
  subscriptions: { module: 'finance', level: 'READ_ONLY' },
  transactions: { module: 'finance', level: 'READ_ONLY' },

  support: { module: 'support', level: 'READ_ONLY' },
  broadcasts: { module: 'communications', level: 'READ_ONLY' },

  // The reveal console requires the full grant just to LOAD, unlike every other
  // entry here. The page's whole purpose is to surface a live login code, so
  // there is no meaningful read-only view of it to give away — see the
  // otp_reveal note in @jobportal/domain/admin-permissions.
  'otp-sessions': { module: 'otp_reveal', level: 'EDIT' },

  // Staff management. `system`/EDIT rather than a READ_ONLY floor, and the
  // consequence is worth being explicit about: because clampSystem() pins
  // `system` to the tier default in BOTH directions, only SUPER_ADMIN's default
  // is 'EDIT', and no stored override can ever move it — this entry makes the
  // console structurally SUPER_ADMIN-only. It is not merely the current default.
  //
  // The full grant to LOAD, like otp-sessions and unlike everything else here,
  // for the same kind of reason: the read IS the sensitive act. The roster shows
  // exactly which accounts hold the revenue ledger, candidate PII and the OTP
  // reveal — a map of who to phish, and of which account is worth stealing. A
  // read-only tier for it would hand that map to the staff it describes.
  roles: { module: 'system', level: 'EDIT' },
};
