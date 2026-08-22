// SRS §4.16 — /sadmin Roles & Permissions: the platform-staff scope taxonomy,
// role-derived defaults, and the pure resolver + guard helpers.
//
// Deliberately free of NestJS and Prisma so it is trivially unit-testable AND
// importable from both sides of the split. That matters more here than it did
// for the recruiter equivalent: apps/api enforces this in AdminGuard, while
// apps/sadmin enforces it in RSC pages that never call the API at all (24 lib
// modules query Postgres directly), so the SAME map has to be evaluated in two
// runtimes. It lives in @jobportal/domain rather than in either app because
// apps/api/src/recruiter-users/permissions.ts already got hand-copied into
// apps/recruiter/lib/users/permissions.ts to cross that boundary, and a third
// hand-maintained copy is precisely how two enforcement points drift into
// disagreeing about who may do what.
//
// AdminStaffRole itself comes from @jobportal/db (the enum is the source of
// truth), so a member added there fails this file's Record<> exhaustiveness
// check at compile time rather than silently defaulting to no access.

import type { AdminStaffRole } from '@jobportal/db';

// The functional modules a super admin can tune per staff account.
//
// These are DOMAINS OF HARM, not screens. Two decisions in this list are
// load-bearing and neither is obvious from the console's own navigation:
//
//  1. `otp_reveal` is split out of `verification` even though both live behind
//     the same "is this account real" idea and KYC review sits one nav item
//     away. Revealing a signup OTP is an ACCOUNT-TAKEOVER PRIMITIVE — it hands
//     staff the code needed to complete someone else's login — and it is a
//     READ. Folding it into `verification` would mean granting READ_ONLY to a
//     support agent so they can check a company's KYC documents also grants
//     them every user's live login code. It is the only capability in this
//     product that is more dangerous as a read than most modules are as writes,
//     so it gets its own grant and defaults to NONE for everyone but SUPER_ADMIN.
//
//  2. `system` covers feature flags AND staff management together, because they
//     are the same privilege wearing two hats: whoever can write flags can turn
//     off the killswitches that gate every other module, and whoever can edit
//     staff can grant themselves any module directly. Anything less than
//     SUPER_ADMIN on this module makes every other entry in this list
//     decorative. See clampSystem() below — it is not overridable.
export const ADMIN_MODULES = [
  'support', // tickets, contact messages, internal notes
  'moderation', // job review queue, job postings, content reports
  'finance', // subscriptions, billing grants, the transaction ledger + export
  'users', // candidate + employer management (the PII-dense consoles)
  'verification', // company KYC review
  'otp_reveal', // signup-OTP code reveal — see note 1 above
  'communications', // broadcast notifications
  'system', // feature flags + staff management — see note 2 above
] as const;
export type AdminModule = (typeof ADMIN_MODULES)[number];

// EDIT ⊃ READ_ONLY ⊃ NONE. A required level is met by any equal-or-higher one.
// Same three-rung ladder as the recruiter taxonomy, deliberately: staff move
// between the two mental models and a second vocabulary would earn nothing.
export const ADMIN_ACCESS_LEVELS = ['NONE', 'READ_ONLY', 'EDIT'] as const;
export type AdminAccessLevel = (typeof ADMIN_ACCESS_LEVELS)[number];

export type AdminPermissionMap = Record<AdminModule, AdminAccessLevel>;

const LEVEL_RANK: Record<AdminAccessLevel, number> = {
  NONE: 0,
  READ_ONLY: 1,
  EDIT: 2,
};

// Per-role baselines. A super admin can override any module per account EXCEPT
// `system` (clampSystem), so treat these as the starting point, not the ceiling.
//
// The recurring `users: 'READ_ONLY'` is intentional across all three sub-roles:
// every one of these jobs is done ON BEHALF of a named person, and staff who
// cannot look up who they are dealing with route the work back to a super admin
// immediately, which defeats the delegation this feature exists for. READ_ONLY,
// not EDIT — reading a candidate's record to answer a ticket is the job;
// editing it is not.
export const ADMIN_ROLE_DEFAULT_PERMISSIONS: Record<AdminStaffRole, AdminPermissionMap> = {
  SUPER_ADMIN: {
    support: 'EDIT',
    moderation: 'EDIT',
    finance: 'EDIT',
    users: 'EDIT',
    verification: 'EDIT',
    otp_reveal: 'EDIT',
    communications: 'EDIT',
    system: 'EDIT',
  },
  // Answers tickets and contact messages. Gets verification READ_ONLY because
  // "why was my company rejected" is a support question they should be able to
  // answer without escalating — but not the approval itself, and explicitly not
  // otp_reveal, which is the capability a social-engineered support agent is
  // most likely to be talked into using.
  SUPPORT_ADMIN: {
    support: 'EDIT',
    moderation: 'NONE',
    finance: 'NONE',
    users: 'READ_ONLY',
    verification: 'READ_ONLY',
    otp_reveal: 'NONE',
    communications: 'NONE',
    system: 'NONE',
  },
  // Owns what appears on the platform: the job review queue, postings, and
  // user-raised content reports. `communications: 'EDIT'` pairs announcements
  // with the role that already owns platform-facing content — note this is the
  // most consequential default in this map, since a broadcast reaches every
  // recruiter at once and cannot be recalled. It is guarded independently by
  // the broadcast console's own typed-recipient-count confirmation and
  // killswitch.admin_broadcast_send, and a super admin can override it to NONE
  // per account. Called out in docs/adr/0007 as the tunable one.
  CONTENT_ADMIN: {
    support: 'NONE',
    moderation: 'EDIT',
    finance: 'NONE',
    users: 'READ_ONLY',
    verification: 'NONE',
    otp_reveal: 'NONE',
    communications: 'EDIT',
    system: 'NONE',
  },
  // Plans, grants, the ledger and its CSV export. No moderation, no support,
  // no verification — money and content have no overlap in this product.
  FINANCE_ADMIN: {
    support: 'NONE',
    moderation: 'NONE',
    finance: 'EDIT',
    users: 'READ_ONLY',
    verification: 'NONE',
    otp_reveal: 'NONE',
    communications: 'NONE',
    system: 'NONE',
  },
};

export function isAdminAccessLevel(v: unknown): v is AdminAccessLevel {
  return typeof v === 'string' && (ADMIN_ACCESS_LEVELS as readonly string[]).includes(v);
}

export function isAdminModule(v: unknown): v is AdminModule {
  return typeof v === 'string' && (ADMIN_MODULES as readonly string[]).includes(v);
}

// `system` is never overridable — it is always exactly the role default.
//
// This is the one invariant that holds the rest of the model up. Without it,
// a single mis-clicked override (or one hand-edited row in a psql session, which
// is how this product's admins have always been made) grants a sub-admin feature
// flags and staff management, and from there they grant themselves everything
// else and switch off the killswitches that would have contained it. Enforcing
// it HERE rather than only in the update DTO is deliberate: the DTO guards the
// API path, and the API path is not the only way a permissions JSON blob gets
// into this column.
function clampSystem(role: AdminStaffRole, perms: AdminPermissionMap): AdminPermissionMap {
  return { ...perms, system: ADMIN_ROLE_DEFAULT_PERMISSIONS[role].system };
}

// Resolve the EFFECTIVE scope map: role defaults, then any per-module overrides.
//
// Tolerant of null / partial / garbage `stored` JSON (hand-edited rows, columns
// written before a module existed): unknown keys are ignored and any module the
// blob does not mention falls back to its ROLE DEFAULT, so the result always
// covers every module exactly once. Falling back to the role default rather than
// to NONE is safe precisely because the defaults above are the conservative
// baseline — a Finance Admin with a corrupted blob lands on Finance Admin
// access, never on more.
export function resolveAdminPermissions(
  role: AdminStaffRole,
  stored: unknown,
): AdminPermissionMap {
  const result: AdminPermissionMap = { ...ADMIN_ROLE_DEFAULT_PERMISSIONS[role] };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const rec = stored as Record<string, unknown>;
    for (const mod of ADMIN_MODULES) {
      const v = rec[mod];
      if (isAdminAccessLevel(v)) result[mod] = v;
    }
  }
  return clampSystem(role, result);
}

export function meetsAdminLevel(actual: AdminAccessLevel, required: AdminAccessLevel): boolean {
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

export function hasAdminScope(
  perms: AdminPermissionMap,
  module: AdminModule,
  required: AdminAccessLevel,
): boolean {
  return meetsAdminLevel(perms[module], required);
}

// Display labels. Here rather than in either app for the same reason the
// taxonomy is: apps/api names these in error messages and audit diffs, and
// apps/sadmin renders them in the permission matrix. Two copies would let the
// console and the 403 it produces describe the same grant differently.
export const ADMIN_MODULE_LABEL: Record<AdminModule, string> = {
  support: 'Support & messages',
  moderation: 'Content moderation',
  finance: 'Subscriptions & revenue',
  users: 'Candidates & employers',
  verification: 'Company KYC',
  otp_reveal: 'OTP code reveal',
  communications: 'Broadcasts',
  system: 'Feature flags & staff',
};

export const ADMIN_STAFF_ROLE_LABEL: Record<AdminStaffRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SUPPORT_ADMIN: 'Support Admin',
  CONTENT_ADMIN: 'Content Admin',
  FINANCE_ADMIN: 'Finance Admin',
};

export const ADMIN_ACCESS_LEVEL_LABEL: Record<AdminAccessLevel, string> = {
  NONE: 'No access',
  READ_ONLY: 'View only',
  EDIT: 'Full access',
};

// The roles a super admin may assign through the console.
//
// SUPER_ADMIN is absent BY DESIGN, and this constant is the single place that
// decision is expressed. FR-4.12.10 and CLAUDE.md §9 say the top tier is
// assigned only by direct DB write; this feature relaxes that for staff tiers
// while keeping it exactly true for the tier that can grant everything else.
// The API re-derives its allowlist from this array rather than repeating it, so
// there is no second list to forget.
export const ASSIGNABLE_ADMIN_STAFF_ROLES = [
  'SUPPORT_ADMIN',
  'CONTENT_ADMIN',
  'FINANCE_ADMIN',
] as const;
export type AssignableAdminStaffRole = (typeof ASSIGNABLE_ADMIN_STAFF_ROLES)[number];

export function isAssignableAdminStaffRole(v: unknown): v is AssignableAdminStaffRole {
  return (
    typeof v === 'string' && (ASSIGNABLE_ADMIN_STAFF_ROLES as readonly string[]).includes(v)
  );
}
