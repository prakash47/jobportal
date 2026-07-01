import { describe, expect, it } from 'vitest';
import {
  RECRUITER_MODULES,
  ROLE_DEFAULT_PERMISSIONS,
  hasModuleAccess,
  isModuleAccessLevel,
  meetsLevel,
  resolvePermissions,
} from './permissions';

const ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

describe('recruiter-users permission taxonomy', () => {
  it('every role default covers every module exactly once', () => {
    for (const role of ROLES) {
      const map = ROLE_DEFAULT_PERMISSIONS[role];
      expect(Object.keys(map).sort()).toEqual([...RECRUITER_MODULES].sort());
    }
  });

  it('meetsLevel implements EDIT > READ_ONLY > NONE', () => {
    expect(meetsLevel('EDIT', 'READ_ONLY')).toBe(true);
    expect(meetsLevel('EDIT', 'EDIT')).toBe(true);
    expect(meetsLevel('READ_ONLY', 'EDIT')).toBe(false);
    expect(meetsLevel('READ_ONLY', 'READ_ONLY')).toBe(true);
    expect(meetsLevel('NONE', 'READ_ONLY')).toBe(false);
    expect(meetsLevel('EDIT', 'NONE')).toBe(true);
  });

  it('resolvePermissions returns the role defaults when nothing is stored', () => {
    expect(resolvePermissions('MEMBER', null)).toEqual(ROLE_DEFAULT_PERMISSIONS.MEMBER);
    expect(resolvePermissions('OWNER', undefined)).toEqual(ROLE_DEFAULT_PERMISSIONS.OWNER);
  });

  it('overlays stored overrides on top of the role defaults', () => {
    const out = resolvePermissions('MEMBER', { jobs: 'READ_ONLY', company_profile: 'EDIT' });
    expect(out.jobs).toBe('READ_ONLY'); // overridden
    expect(out.company_profile).toBe('EDIT'); // overridden
    expect(out.applicants).toBe(ROLE_DEFAULT_PERMISSIONS.MEMBER.applicants); // default retained
  });

  it('is tolerant of junk: ignores unknown keys + invalid levels, still covers every module', () => {
    const out = resolvePermissions('ADMIN', { jobs: 'BOGUS', nope: 'EDIT', applicants: 42 });
    expect(out.jobs).toBe(ROLE_DEFAULT_PERMISSIONS.ADMIN.jobs); // invalid level ignored
    expect(out).not.toHaveProperty('nope');
    expect(Object.keys(out).sort()).toEqual([...RECRUITER_MODULES].sort());
  });

  it('is tolerant of arrays / primitives (falls back to role defaults)', () => {
    expect(resolvePermissions('OWNER', ['x'])).toEqual(ROLE_DEFAULT_PERMISSIONS.OWNER);
    expect(resolvePermissions('OWNER', 'nope')).toEqual(ROLE_DEFAULT_PERMISSIONS.OWNER);
  });

  it('isModuleAccessLevel guards the three literals only', () => {
    expect(isModuleAccessLevel('EDIT')).toBe(true);
    expect(isModuleAccessLevel('READ_ONLY')).toBe(true);
    expect(isModuleAccessLevel('NONE')).toBe(true);
    expect(isModuleAccessLevel('edit')).toBe(false);
    expect(isModuleAccessLevel(1)).toBe(false);
  });

  it('hasModuleAccess evaluates a resolved map', () => {
    const perms = resolvePermissions('MEMBER', null);
    expect(hasModuleAccess(perms, 'jobs', 'EDIT')).toBe(true); // member jobs default = EDIT
    expect(hasModuleAccess(perms, 'company_profile', 'EDIT')).toBe(false); // member = READ_ONLY
    expect(hasModuleAccess(perms, 'company_profile', 'READ_ONLY')).toBe(true);
  });
});
