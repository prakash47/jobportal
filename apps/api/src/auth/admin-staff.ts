// SRS §4.16 — loading the acting staff member's effective scope map.
//
// The one place apps/api turns "this request carries an ADMIN token" into "this
// person may do X". Kept free of NestJS so the same function backs the guard,
// any service that needs a second check, and the unit tests.
//
// WHY THIS IS A DB READ AND NOT A JWT CLAIM. The access token is issued for 15
// minutes, apps/sadmin never calls /auth/refresh (repo-wide grep: zero hits), and
// AccessClaims carries no jti to denylist. A scope baked into the token could
// therefore not be revoked at all until it expired on its own — a demoted
// Finance Admin would keep reading the ledger for up to a quarter of an hour
// with no lever to pull. Reading the row per request costs one indexed lookup on
// a unique key and makes revocation take effect on the next click.
//
// Worse, a token-borne scope fails OPEN here specifically: verifyAccessToken
// blind-casts its payload (`return decoded as unknown as AccessClaims`), so every
// token minted before this feature deployed would arrive with `permissions ===
// undefined` and any `claims.permissions?.includes(...)` check would wave it
// through.

import { prisma } from '@jobportal/db';
import {
  hasAdminScope,
  resolveAdminPermissions,
  type AdminAccessLevel,
  type AdminModule,
  type AdminPermissionMap,
} from '@jobportal/domain/admin-permissions';
import type { AdminStaffRole } from '@jobportal/db';

export type AdminStaffContext = {
  userId: number;
  staffRole: AdminStaffRole;
  permissions: AdminPermissionMap;
};

/**
 * Load the acting admin's staff row and resolve their effective scope map.
 *
 * Returns `null` when the user has NO staff row or has been deactivated. Both
 * are treated identically and both mean NO ACCESS — not "legacy admin, allow
 * everything". That direction is the whole point: `User.role = 'ADMIN'` now
 * means only "is staff at all", and any account that predates this table, or was
 * promoted by a direct DB write without a matching row, has to be granted a tier
 * explicitly before it can act. The seed provisions the row for
 * admin@careerqueue.in so "seed, then log in" keeps working.
 */
export async function loadAdminStaffContext(userId: number): Promise<AdminStaffContext | null> {
  const row = await prisma.adminStaff.findUnique({
    where: { userId },
    select: { staffRole: true, permissions: true, deactivatedAt: true },
  });

  if (!row || row.deactivatedAt !== null) return null;

  return {
    userId,
    staffRole: row.staffRole,
    permissions: resolveAdminPermissions(row.staffRole, row.permissions),
  };
}

/** Does this staff context satisfy `module` at `required`? */
export function staffHasScope(
  ctx: AdminStaffContext,
  module: AdminModule,
  required: AdminAccessLevel,
): boolean {
  return hasAdminScope(ctx.permissions, module, required);
}

/**
 * Is this staff member a super admin?
 *
 * Derived from the `system` scope rather than from `staffRole === 'SUPER_ADMIN'`
 * so there is exactly one definition of "top tier" in the codebase, and it is
 * the same one the guard enforces. `system` is non-overridable (clampSystem in
 * @jobportal/domain/admin-permissions), so this cannot be widened by a stored
 * permissions blob.
 */
export function isSuperAdmin(ctx: AdminStaffContext): boolean {
  return hasAdminScope(ctx.permissions, 'system', 'EDIT');
}
