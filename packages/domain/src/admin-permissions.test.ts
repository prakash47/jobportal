import { describe, expect, it } from 'vitest';
import {
  ADMIN_ACCESS_LEVEL_LABEL,
  ADMIN_MODULE_LABEL,
  ADMIN_MODULES,
  ADMIN_ROLE_DEFAULT_PERMISSIONS,
  ADMIN_STAFF_ROLE_LABEL,
  ASSIGNABLE_ADMIN_STAFF_ROLES,
  hasAdminScope,
  isAssignableAdminStaffRole,
  meetsAdminLevel,
  resolveAdminPermissions,
  type AdminModule,
} from './admin-permissions';

describe('level ladder', () => {
  it('implements EDIT > READ_ONLY > NONE', () => {
    expect(meetsAdminLevel('EDIT', 'READ_ONLY')).toBe(true);
    expect(meetsAdminLevel('EDIT', 'EDIT')).toBe(true);
    expect(meetsAdminLevel('READ_ONLY', 'EDIT')).toBe(false);
    expect(meetsAdminLevel('READ_ONLY', 'READ_ONLY')).toBe(true);
    expect(meetsAdminLevel('NONE', 'READ_ONLY')).toBe(false);
    expect(meetsAdminLevel('EDIT', 'NONE')).toBe(true);
  });
});

describe('role defaults', () => {
  it('covers every module for every role exactly once', () => {
    for (const [role, map] of Object.entries(ADMIN_ROLE_DEFAULT_PERMISSIONS)) {
      expect(Object.keys(map).sort(), `${role} module coverage`).toEqual([...ADMIN_MODULES].sort());
    }
  });

  it('gives SUPER_ADMIN full access everywhere', () => {
    for (const mod of ADMIN_MODULES) {
      expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN[mod], mod).toBe('EDIT');
    }
  });

  // The invariant the whole model rests on: whoever holds `system` can write
  // feature flags and edit staff, and can therefore grant themselves every
  // other module and switch off the killswitches that would have contained it.
  it('grants `system` to SUPER_ADMIN and to nobody else', () => {
    expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN.system).toBe('EDIT');
    for (const role of ASSIGNABLE_ADMIN_STAFF_ROLES) {
      expect(ADMIN_ROLE_DEFAULT_PERMISSIONS[role].system, role).toBe('NONE');
    }
  });

  // otp_reveal is an account-takeover primitive that happens to be a read, so
  // it must not ride along on any sub-role's default — including SUPPORT_ADMIN,
  // the role most exposed to social engineering.
  it('withholds otp_reveal from every assignable role', () => {
    for (const role of ASSIGNABLE_ADMIN_STAFF_ROLES) {
      expect(ADMIN_ROLE_DEFAULT_PERMISSIONS[role].otp_reveal, role).toBe('NONE');
    }
  });

  it('never lets an assignable role reach the money or the moderation queue by default unless it owns it', () => {
    expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.SUPPORT_ADMIN.finance).toBe('NONE');
    expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.CONTENT_ADMIN.finance).toBe('NONE');
    expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.FINANCE_ADMIN.moderation).toBe('NONE');
    expect(ADMIN_ROLE_DEFAULT_PERMISSIONS.SUPPORT_ADMIN.moderation).toBe('NONE');
  });
});

describe('resolveAdminPermissions', () => {
  it('returns the role defaults when nothing is stored', () => {
    expect(resolveAdminPermissions('FINANCE_ADMIN', null)).toEqual(
      ADMIN_ROLE_DEFAULT_PERMISSIONS.FINANCE_ADMIN,
    );
    expect(resolveAdminPermissions('FINANCE_ADMIN', undefined)).toEqual(
      ADMIN_ROLE_DEFAULT_PERMISSIONS.FINANCE_ADMIN,
    );
  });

  it('overlays a partial override and leaves other modules on the role default', () => {
    const perms = resolveAdminPermissions('SUPPORT_ADMIN', { moderation: 'EDIT' });
    expect(perms.moderation).toBe('EDIT');
    expect(perms.support).toBe('EDIT'); // role default, untouched
    expect(perms.finance).toBe('NONE'); // role default, untouched
  });

  it('can also REVOKE below the role default', () => {
    const perms = resolveAdminPermissions('CONTENT_ADMIN', { communications: 'NONE' });
    expect(perms.communications).toBe('NONE');
  });

  // Hand-edited rows and columns written before a module existed are the normal
  // case for this table, not the exotic one — admins in this product have always
  // been made with psql.
  it('ignores garbage without widening access', () => {
    const perms = resolveAdminPermissions('SUPPORT_ADMIN', {
      finance: 'SUPERUSER',
      nonsense: 'EDIT',
      moderation: 42,
      users: null,
    });
    expect(perms.finance).toBe('NONE');
    expect(perms.moderation).toBe('NONE');
    expect(perms.users).toBe('READ_ONLY');
    expect(Object.keys(perms).sort()).toEqual([...ADMIN_MODULES].sort());
  });

  it('tolerates non-object stored values', () => {
    for (const junk of ['', 'EDIT', 0, 7, true, [], ['EDIT']]) {
      expect(resolveAdminPermissions('SUPPORT_ADMIN', junk)).toEqual(
        ADMIN_ROLE_DEFAULT_PERMISSIONS.SUPPORT_ADMIN,
      );
    }
  });

  // clampSystem — the privilege-escalation stopper. An override blob is not a
  // trusted input: it reaches this column from the API, from the seed, and from
  // whatever anyone types into psql.
  it('refuses to let an override grant `system`', () => {
    for (const role of ASSIGNABLE_ADMIN_STAFF_ROLES) {
      const perms = resolveAdminPermissions(role, { system: 'EDIT' });
      expect(perms.system, role).toBe('NONE');
      expect(hasAdminScope(perms, 'system', 'READ_ONLY'), role).toBe(false);
    }
    expect(resolveAdminPermissions('SUPPORT_ADMIN', { system: 'READ_ONLY' }).system).toBe('NONE');
  });

  it('also refuses to let an override REMOVE `system` from a super admin', () => {
    // Otherwise the last super admin could lock the platform out of its own
    // flag console with a single bad override.
    expect(resolveAdminPermissions('SUPER_ADMIN', { system: 'NONE' }).system).toBe('EDIT');
  });
});

describe('hasAdminScope', () => {
  it('evaluates a resolved map', () => {
    const perms = resolveAdminPermissions('SUPPORT_ADMIN', null);
    expect(hasAdminScope(perms, 'support', 'EDIT')).toBe(true);
    expect(hasAdminScope(perms, 'users', 'READ_ONLY')).toBe(true);
    expect(hasAdminScope(perms, 'users', 'EDIT')).toBe(false);
    expect(hasAdminScope(perms, 'finance', 'READ_ONLY')).toBe(false);
  });
});

describe('assignable roles', () => {
  // FR-4.12.10 / CLAUDE.md §9: the console may mint staff, but never the tier
  // that can grant every other tier.
  it('excludes SUPER_ADMIN', () => {
    expect((ASSIGNABLE_ADMIN_STAFF_ROLES as readonly string[]).includes('SUPER_ADMIN')).toBe(false);
    expect(isAssignableAdminStaffRole('SUPER_ADMIN')).toBe(false);
  });

  it('accepts the three staff tiers and rejects junk', () => {
    for (const role of ASSIGNABLE_ADMIN_STAFF_ROLES) {
      expect(isAssignableAdminStaffRole(role)).toBe(true);
    }
    for (const junk of ['ADMIN', 'super_admin', '', null, undefined, 3, {}]) {
      expect(isAssignableAdminStaffRole(junk)).toBe(false);
    }
  });
});

describe('labels', () => {
  // A missing label renders as `undefined` in the permission matrix rather than
  // failing anywhere, so exhaustiveness is asserted rather than trusted.
  it('labels every module and every level', () => {
    for (const mod of ADMIN_MODULES) {
      expect(ADMIN_MODULE_LABEL[mod as AdminModule], mod).toBeTruthy();
    }
    expect(Object.keys(ADMIN_ACCESS_LEVEL_LABEL).sort()).toEqual(['EDIT', 'NONE', 'READ_ONLY']);
    for (const role of Object.keys(ADMIN_ROLE_DEFAULT_PERMISSIONS)) {
      expect(ADMIN_STAFF_ROLE_LABEL[role as keyof typeof ADMIN_STAFF_ROLE_LABEL], role).toBeTruthy();
    }
  });
});
