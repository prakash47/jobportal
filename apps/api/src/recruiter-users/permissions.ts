// SRS §4.9 — recruiter Team / User management: the module-level permission
// taxonomy + role-derived defaults + pure resolver/guard helpers. Deliberately
// free of NestJS + Prisma so it is trivially unit-testable and reusable by the
// (future) per-module enforcement that will be wired into the other recruiter
// endpoints (recruiter-jobs / applicants / profile / kyc). This PR uses it to
// STORE + DISPLAY permissions and to back the reusable hasModuleAccess() hook;
// enforcing it across the existing endpoints is a deliberate, owner-approved
// fast-follow ("Panel + hook" scope). The recruiter app mirrors this taxonomy in
// apps/recruiter/lib/users/permissions.ts (kept in sync — the two apps can't
// share app-level code; RecruiterRole itself comes from @jobportal/db).

import type { RecruiterRole } from '@jobportal/db';

// The functional modules whose access a team admin can tune per member. Team
// MANAGEMENT itself is gated by companyRole (OWNER/ADMIN), not a module toggle,
// so it is intentionally NOT in this list.
export const RECRUITER_MODULES = [
  'jobs',
  'applicants',
  'company_profile',
  'verification',
  'notifications',
] as const;
export type RecruiterModule = (typeof RECRUITER_MODULES)[number];

// EDIT ⊃ READ_ONLY ⊃ NONE. A required level is met by any equal-or-higher level.
export const MODULE_ACCESS_LEVELS = ['NONE', 'READ_ONLY', 'EDIT'] as const;
export type ModuleAccessLevel = (typeof MODULE_ACCESS_LEVELS)[number];

export type PermissionMap = Record<RecruiterModule, ModuleAccessLevel>;

// Ordered strength for meetsLevel(). Higher rank = more access.
const LEVEL_RANK: Record<ModuleAccessLevel, number> = {
  NONE: 0,
  READ_ONLY: 1,
  EDIT: 2,
};

// Sensible defaults per in-company role. OWNER/ADMIN get full EDIT across the
// board; a MEMBER does the actual recruiting (jobs + applicants + their own
// notification prefs) but only reads the company profile + verification until an
// admin grants more. An admin can override any of these per member.
export const ROLE_DEFAULT_PERMISSIONS: Record<RecruiterRole, PermissionMap> = {
  OWNER: {
    jobs: 'EDIT',
    applicants: 'EDIT',
    company_profile: 'EDIT',
    verification: 'EDIT',
    notifications: 'EDIT',
  },
  ADMIN: {
    jobs: 'EDIT',
    applicants: 'EDIT',
    company_profile: 'EDIT',
    verification: 'EDIT',
    notifications: 'EDIT',
  },
  MEMBER: {
    jobs: 'EDIT',
    applicants: 'EDIT',
    company_profile: 'READ_ONLY',
    verification: 'READ_ONLY',
    notifications: 'EDIT',
  },
};

export function isModuleAccessLevel(v: unknown): v is ModuleAccessLevel {
  return typeof v === 'string' && (MODULE_ACCESS_LEVELS as readonly string[]).includes(v);
}

// Resolve the EFFECTIVE permission map for a recruiter: start from the role
// defaults, then overlay any explicitly-stored per-module overrides. Tolerant of
// a null / partial / garbage `stored` JSON (older rows, hand-edited data):
// unknown keys are ignored and missing modules fall back to the role default, so
// the result always covers every module exactly once.
export function resolvePermissions(role: RecruiterRole, stored: unknown): PermissionMap {
  const result: PermissionMap = { ...ROLE_DEFAULT_PERMISSIONS[role] };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const rec = stored as Record<string, unknown>;
    for (const mod of RECRUITER_MODULES) {
      const v = rec[mod];
      if (isModuleAccessLevel(v)) result[mod] = v;
    }
  }
  return result;
}

// Does `actual` satisfy the `required` level? Pure — the DB-backed assertion
// (load the caller's row, then check) lives in the service.
export function meetsLevel(actual: ModuleAccessLevel, required: ModuleAccessLevel): boolean {
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

export function hasModuleAccess(
  perms: PermissionMap,
  module: RecruiterModule,
  required: ModuleAccessLevel,
): boolean {
  return meetsLevel(perms[module], required);
}
