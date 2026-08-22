// SRS §4.16 — reads for the Roles & Permissions console.
//
// Direct Prisma from the RSC, per this repo's reads/writes split. That is why
// every page in app/(authed)/roles/ carries its own requireAdminScope() call:
// AdminGuard never sees these queries, so Layer 2 is the only thing protecting
// them. See lib/roles/scope-map.ts.
//
// READS ONLY. A prisma.*.update() in this file is the documented anti-pattern —
// it would bypass AdminGuard, the killswitch and the audit row in one step.

import { prisma } from '@jobportal/db';
import { resolveAdminPermissions } from '@jobportal/domain/admin-permissions';
import type { PendingInviteItem, StaffDetail, StaffListItem } from './types';

/**
 * Every staff account, active first.
 *
 * No pagination and no search, deliberately. This table holds one row per person
 * with access to the platform's internals — single digits today and unlikely to
 * reach two — so a page control would be furniture that never activates, and a
 * search box would hide rows on a screen whose entire job is to answer "who has
 * access?" completely. If it ever grows, the pattern to copy is
 * lib/broadcasts/queries.ts.
 */
export async function listStaff(): Promise<StaffListItem[]> {
  const rows = await prisma.adminStaff.findMany({
    // Active before deactivated, then oldest first so the seeded super admin
    // heads the list and the ordering does not shuffle as people are added.
    // The id tiebreak keeps it a total order: two rows created in the same
    // millisecond would otherwise be free to swap between renders.
    orderBy: [{ deactivatedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      staffRole: true,
      permissions: true,
      deactivatedAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    staffRole: r.staffRole,
    // Resolved here rather than in the page so the list, the detail screen and
    // the guards all read the same effective map — including clampSystem, which
    // is what stops `system` ever rendering as anything but the tier default.
    permissions: resolveAdminPermissions(r.staffRole, r.permissions),
    deactivatedAt: r.deactivatedAt,
    createdAt: r.createdAt,
  }));
}

/** One staff account, or null when the id does not exist. */
export async function getStaffDetail(id: number): Promise<StaffDetail | null> {
  const row = await prisma.adminStaff.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      staffRole: true,
      permissions: true,
      deactivatedAt: true,
      createdAt: true,
      createdById: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;

  // createdById is a loose actor id with no FK — deliberately, so provenance
  // outlives the provisioner's account — which means it has to be looked up
  // separately and may legitimately resolve to nothing.
  const createdBy =
    row.createdById === null
      ? null
      : await prisma.user.findUnique({
          where: { id: row.createdById },
          select: { email: true },
        });

  return {
    id: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    staffRole: row.staffRole,
    permissions: resolveAdminPermissions(row.staffRole, row.permissions),
    deactivatedAt: row.deactivatedAt,
    createdAt: row.createdAt,
    hasOverrides: row.permissions !== null,
    createdByEmail: createdBy?.email ?? null,
  };
}

/**
 * Invitations that are still live.
 *
 * Pending is DERIVED, never stored: not accepted, not revoked, not past its
 * expiry. There is no status column and no sweeper job, so an expired invite
 * simply stops appearing here rather than lingering as an "Expired" row — which
 * is the same treatment RecruiterInvite gets, and the reason the three
 * predicates below must stay together.
 */
export async function listPendingInvites(): Promise<PendingInviteItem[]> {
  const rows = await prisma.adminStaffInvite.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      email: true,
      staffRole: true,
      expiresAt: true,
      createdAt: true,
      invitedByUserId: true,
    },
  });
  if (rows.length === 0) return [];

  // One lookup for every inviter on the page rather than one per row. Same
  // loose-actor-id reasoning as createdById above.
  const inviterIds = [...new Set(rows.flatMap((r) => (r.invitedByUserId === null ? [] : [r.invitedByUserId])))];
  const inviters = await prisma.user.findMany({
    where: { id: { in: inviterIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(inviters.map((u) => [u.id, u.email]));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    staffRole: r.staffRole,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    invitedByEmail: r.invitedByUserId === null ? null : (emailById.get(r.invitedByUserId) ?? null),
  }));
}
