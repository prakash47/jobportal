// SRS §4.16 — display helpers for the Roles & Permissions console.
//
// ⚠ The label tables are NOT here. ADMIN_MODULE_LABEL, ADMIN_STAFF_ROLE_LABEL
// and ADMIN_ACCESS_LEVEL_LABEL all live in @jobportal/domain/admin-permissions,
// where apps/api reads them for its refusal messages. A second copy here is
// exactly how the console and the 403 it produces end up describing the same
// grant differently — which is the mistake the recruiter taxonomy already made
// (see the "4th copy of APPLICATION_STATUS_LABEL" note in lib/candidates/format).
// Import them from the domain package; do not redefine them.

import type { AdminStaffRole } from '@jobportal/db';
import {
  ADMIN_MODULES,
  ADMIN_STAFF_ROLE_LABEL,
  type AdminModule,
  type AdminPermissionMap,
} from '@jobportal/domain/admin-permissions';

// hrefs are basePath-RELATIVE. next.config sets basePath '/sadmin' and Next
// prefixes it itself, so '/sadmin/roles' here resolves to /sadmin/sadmin/roles.
// The one place the prefix IS written by hand is the emailed invite URL, built
// server-side in apps/api where no Next router is involved.
export const rolesHref = (): string => '/roles';
export const newStaffHref = (): string => '/roles/new';
export const staffDetailHref = (id: number): string => `/roles/${id}`;

/**
 * The seven modules a stored blob may actually move, in display order.
 *
 * `system` is filtered out rather than rendered disabled. clampSystem() forces
 * it back to the tier default on every resolve, in both directions, so a control
 * for it could not do anything — and a toggle that silently no-ops is worse than
 * no toggle. The detail page states the rule in prose instead.
 */
export const OVERRIDABLE_ADMIN_MODULES: readonly AdminModule[] = ADMIN_MODULES.filter(
  (m) => m !== 'system',
);

/** "Support Admin", "Super Admin" — from the one shared table. */
export function formatStaffRole(role: AdminStaffRole): string {
  return ADMIN_STAFF_ROLE_LABEL[role];
}

/**
 * How many modules this account can reach at all, for the list row.
 *
 * A count rather than a list of names: the roster's job is to let someone scan
 * for the account with more reach than it should have, and eight module names
 * per row buries that in text. The detail page shows the full matrix.
 */
export function countGrantedModules(permissions: AdminPermissionMap): number {
  return ADMIN_MODULES.filter((m) => permissions[m] !== 'NONE').length;
}

/** "3 of 8 areas" — paired with the tier label, never shown alone. */
export function formatModuleReach(permissions: AdminPermissionMap): string {
  return `${countGrantedModules(permissions)} of ${ADMIN_MODULES.length} areas`;
}

/**
 * The roster's live-region summary.
 *
 * Names the deactivated count separately because those rows stay on screen —
 * "4 staff accounts" above a table with five rows reads as a bug.
 */
export function formatStaffSummary(active: number, deactivated: number): string {
  const staff = `${active} active staff ${active === 1 ? 'account' : 'accounts'}`;
  return deactivated === 0 ? staff : `${staff}, ${deactivated} deactivated`;
}

/** "Expires in 2 days" / "Expires in 5 hours" / "Expires shortly". */
export function formatExpiry(expiresAt: Date, now: Date = new Date()): string {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (hours >= 1) return `Expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return 'Expires shortly';
}
