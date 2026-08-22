// SRS §4.16 — shapes the Roles & Permissions console renders.
//
// These are the RSC's own read models, not API DTOs: this portal's reads go
// straight to Postgres per the repo's reads/writes split (ARCHITECTURE.md), so
// there is no wire format to mirror. Only the writes go through apps/api.

import type { AdminStaffRole } from '@jobportal/db';
import type { AdminPermissionMap } from '@jobportal/domain/admin-permissions';

export interface StaffListItem {
  id: number;
  userId: number;
  name: string;
  email: string;
  staffRole: AdminStaffRole;
  /** Already resolved through the tier defaults + clampSystem. */
  permissions: AdminPermissionMap;
  /** Null means active. Staff are deactivated, never deleted. */
  deactivatedAt: Date | null;
  createdAt: Date;
}

export interface StaffDetail extends StaffListItem {
  /**
   * Whether this account carries a stored override blob at all.
   *
   * Distinct from "its resolved map differs from the tier default", because the
   * two answer different questions: a blob that happens to match the defaults
   * still means future changes to those defaults will NOT reach this account.
   * The detail page says so explicitly rather than letting it look inherited.
   */
  hasOverrides: boolean;
  /** The provisioning super admin's email, when their account still exists. */
  createdByEmail: string | null;
}

export interface PendingInviteItem {
  id: number;
  email: string;
  staffRole: AdminStaffRole;
  expiresAt: Date;
  createdAt: Date;
  invitedByEmail: string | null;
}
