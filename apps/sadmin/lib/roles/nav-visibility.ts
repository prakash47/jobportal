// SRS §4.16 — which rail entries a given staff member may see.
//
// ── Why this is a server-side helper and not logic inside SidebarNav ────────
//
// SidebarNav is a 'use client' component. Filtering it there would mean a
// RUNTIME value import of @jobportal/domain from the client bundle, and
// apps/sadmin/next.config.ts does not list that package in `transpilePackages`
// (only ui/db/auth/types/observability/feature-flags). Workspace packages ship
// raw TypeScript, so the omission surfaces as an opaque parse error at BUILD
// time rather than a helpful message. lib/roles/scope-map.ts gets away with
// importing from it only because that import is `import type`, which is erased.
//
// Resolving here instead keeps the client component taking a plain string[],
// adds nothing to the bundle, and — because apps/sadmin's vitest only collects
// lib/** — puts the logic somewhere tests actually run.
//
// The permission map costs nothing extra to obtain: the (authed) layout already
// calls requireAdminStaff(), which returns it alongside the user.

import { hasAdminScope, type AdminPermissionMap } from '@jobportal/domain/admin-permissions';
import { ROUTE_SCOPES } from './scope-map';

/**
 * Filter nav hrefs down to the ones this staff member can actually open.
 *
 * The join between a nav item and its scope is `href.slice(1)` — ROUTE_SCOPES is
 * keyed by BARE segment ('job-postings') while an href carries its leading slash
 * ('/job-postings'). Segment-level on purpose: a nested route like /roles/new
 * inherits /roles rather than needing its own entry.
 *
 * An href with NO entry in ROUTE_SCOPES is treated as VISIBLE, not hidden. That
 * is the deliberate direction: this function decides what to draw, and the
 * actual enforcement is requireAdminScope() inside each page, which fails closed
 * on its own. Hiding an unmapped link would make a teammate's newly-added rail
 * entry silently vanish for everyone with no error to explain it, while showing
 * one costs at most a 404 on a page that was already refusing them. The drift is
 * caught properly by nav-visibility.test.ts, which fails the build when a
 * NAV_ITEMS href has no ROUTE_SCOPES key.
 */
export function visibleNavHrefs(
  hrefs: readonly string[],
  permissions: AdminPermissionMap,
): string[] {
  return hrefs.filter((href) => {
    const scope = ROUTE_SCOPES[href.slice(1)];
    if (scope === undefined) return true;
    // The dashboard: reachable by anyone holding an active staff row, because it
    // is the post-login landing page and gating it on a module would bounce a
    // Support Admin off the first screen they ever see.
    if (scope === 'ANY_STAFF') return true;
    return hasAdminScope(permissions, scope.module, scope.level);
  });
}
