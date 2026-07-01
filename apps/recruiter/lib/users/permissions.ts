// SRS §4.9 — recruiter Team / User management permission taxonomy for the
// recruiter app (display + form state). MIRROR of the canonical
// apps/api/src/recruiter-users/permissions.ts (the two apps can't share
// app-level code; RecruiterRole itself comes from @jobportal/db). Keep the module
// list, levels, defaults, and resolve logic in sync with the API — the API is the
// trusted boundary; this copy is for rendering + form defaults only.

import type { RecruiterRole } from '@jobportal/db';

export const RECRUITER_MODULES = [
  'jobs',
  'applicants',
  'company_profile',
  'verification',
  'notifications',
] as const;
export type RecruiterModule = (typeof RECRUITER_MODULES)[number];

// Display order (high → low access) for the permission dropdowns.
export const MODULE_ACCESS_LEVELS = ['EDIT', 'READ_ONLY', 'NONE'] as const;
export type ModuleAccessLevel = (typeof MODULE_ACCESS_LEVELS)[number];

export type PermissionMap = Record<RecruiterModule, ModuleAccessLevel>;

export const MODULE_LABELS: Record<RecruiterModule, string> = {
  jobs: 'Jobs',
  applicants: 'Applicants',
  company_profile: 'Company profile',
  verification: 'Verification',
  notifications: 'Notifications',
};

export const LEVEL_LABELS: Record<ModuleAccessLevel, string> = {
  EDIT: 'Can edit',
  READ_ONLY: 'Read only',
  NONE: 'No access',
};

export const ROLE_LABELS: Record<RecruiterRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<RecruiterRole, string> = {
  OWNER: 'Full access, including managing owners and admins.',
  ADMIN: 'Can manage members and invite teammates.',
  MEMBER: 'Standard access; cannot manage the team.',
};

const ROLE_DEFAULT_PERMISSIONS: Record<RecruiterRole, PermissionMap> = {
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

function isModuleAccessLevel(v: unknown): v is ModuleAccessLevel {
  return typeof v === 'string' && (MODULE_ACCESS_LEVELS as readonly string[]).includes(v);
}

export function roleDefaultPermissions(role: RecruiterRole): PermissionMap {
  return { ...ROLE_DEFAULT_PERMISSIONS[role] };
}

// Effective permission map: role defaults overlaid with any stored overrides.
// Tolerant of null / partial / junk `stored` — mirrors the API resolver.
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
