import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_DEFAULT_PERMISSIONS,
  resolveAdminPermissions,
} from '@jobportal/domain/admin-permissions';
import { ROUTE_SCOPES } from './scope-map';
import { NAV_ITEM_HREFS } from './nav-items';
import { visibleNavHrefs } from './nav-visibility';

/**
 * The rail's hrefs, read from SidebarNav.tsx SOURCE rather than imported.
 *
 * The component is 'use client' and pulls in React and lucide-react; this
 * workspace's vitest runs with environment 'node' and collects lib/** only, so
 * importing it would fail on JSX before any assertion ran. scope-map.test.ts
 * reaches out to the filesystem for the same reason.
 */
function navHrefs(): string[] {
  const src = readFileSync(join(__dirname, '..', '..', 'components', 'SidebarNav.tsx'), 'utf8');
  const items = src.match(/\{\s*href:\s*'([^']+)'/g) ?? [];
  return items.flatMap((m) => {
    const href = /href:\s*'([^']+)'/.exec(m)?.[1];
    return href === undefined ? [] : [href];
  });
}

describe('SidebarNav ↔ nav-items ↔ ROUTE_SCOPES', () => {
  /**
   * The two href lists must agree EXACTLY, in both directions.
   *
   * NAV_ITEM_HREFS is a second copy of what SidebarNav renders, and it exists
   * only because the layout cannot import the list from that file: SidebarNav is
   * 'use client', so a server component importing a value from it receives a
   * client reference proxy rather than the array. That shipped once and crashed
   * every page in the portal with "hrefs.filter is not a function" — while
   * typecheck, the unit suites and `pnpm build` all passed, because the types
   * agree on both sides and nothing renders the layout during a build.
   *
   * This assertion is the price of that second copy. A rail row added in one
   * place and not the other is a failing test rather than an unfiltered link.
   */
  it('nav-items.ts matches SidebarNav.tsx exactly, in order', () => {
    expect([...NAV_ITEM_HREFS]).toEqual(navHrefs());
  });

  it('finds the rail items at all', () => {
    // Guards the regex above. If SidebarNav's NAV_ITEMS shape is ever
    // reformatted, every assertion below would pass vacuously on an empty list
    // and this file would stop protecting anything.
    const hrefs = navHrefs();
    expect(hrefs.length).toBeGreaterThanOrEqual(11);
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/roles');
  });

  /**
   * The drift guard, and the reason this file exists.
   *
   * visibleNavHrefs() shows an unmapped href rather than hiding it, which is the
   * right runtime default — a teammate's new rail entry must not silently vanish
   * for everyone — but it means the omission would otherwise be invisible. Here
   * it is a build failure instead.
   *
   * ⚠ feature/sadmin-admin-migration is queued to APPEND to NAV_ITEMS. If that
   * is this test failing for you: add the segment to ROUTE_SCOPES in
   * lib/roles/scope-map.ts. Do not delete the assertion.
   */
  it('every rail item has a ROUTE_SCOPES entry', () => {
    const unmapped = navHrefs().filter((href) => ROUTE_SCOPES[href.slice(1)] === undefined);
    expect(unmapped).toEqual([]);
  });
});

describe('visibleNavHrefs', () => {
  const permsFor = (role: Parameters<typeof resolveAdminPermissions>[0]) =>
    resolveAdminPermissions(role, null);

  it('shows a super admin the entire rail', () => {
    const hrefs = navHrefs();
    expect(visibleNavHrefs(hrefs, permsFor('SUPER_ADMIN'))).toEqual(hrefs);
  });

  // The point of the feature: /roles is system/EDIT, and clampSystem() pins
  // `system` to the tier default in both directions, so no sub-admin can ever
  // see it — not by default, and not via a stored override either.
  it.each(['SUPPORT_ADMIN', 'CONTENT_ADMIN', 'FINANCE_ADMIN'] as const)(
    'hides /roles from %s',
    (role) => {
      expect(visibleNavHrefs(navHrefs(), permsFor(role))).not.toContain('/roles');
    },
  );

  it('cannot be opened up by a stored permissions override', () => {
    // A blob claiming full system access, exactly as a hand-written psql UPDATE
    // might. clampSystem() discards it.
    const forged = resolveAdminPermissions('SUPPORT_ADMIN', { system: 'EDIT' });
    expect(visibleNavHrefs(navHrefs(), forged)).not.toContain('/roles');
  });

  it('keeps the dashboard visible for every tier (ANY_STAFF)', () => {
    for (const role of Object.keys(ADMIN_ROLE_DEFAULT_PERMISSIONS) as Array<
      keyof typeof ADMIN_ROLE_DEFAULT_PERMISSIONS
    >) {
      expect(visibleNavHrefs(navHrefs(), permsFor(role))).toContain('/dashboard');
    }
  });

  it('gives a support admin support but not the revenue ledger', () => {
    const visible = visibleNavHrefs(navHrefs(), permsFor('SUPPORT_ADMIN'));
    expect(visible).toContain('/support');
    expect(visible).not.toContain('/transactions');
    expect(visible).not.toContain('/subscriptions');
    // The account-takeover primitive, which defaults to NONE for every tier.
    expect(visible).not.toContain('/otp-sessions');
  });

  it('gives a finance admin the money screens but not moderation', () => {
    const visible = visibleNavHrefs(navHrefs(), permsFor('FINANCE_ADMIN'));
    expect(visible).toContain('/transactions');
    expect(visible).toContain('/subscriptions');
    expect(visible).not.toContain('/jobs');
    expect(visible).not.toContain('/reports');
  });

  it('shows an href with no ROUTE_SCOPES entry rather than hiding it', () => {
    // Fail-visible, not fail-closed: enforcement is requireAdminScope() in the
    // page, and hiding an unmapped link would make a new rail entry disappear
    // with no error to explain it.
    expect(visibleNavHrefs(['/not-a-real-segment'], permsFor('SUPPORT_ADMIN'))).toEqual([
      '/not-a-real-segment',
    ]);
  });

  it('preserves rail order', () => {
    const hrefs = navHrefs();
    const visible = visibleNavHrefs(hrefs, permsFor('CONTENT_ADMIN'));
    expect(visible).toEqual(hrefs.filter((h) => visible.includes(h)));
  });
});
