import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_MODULES, ADMIN_ACCESS_LEVELS } from '@jobportal/domain/admin-permissions';
import { ROUTE_SCOPES } from './scope-map';

// The enforcement mechanism for Layer 2 in this portal.
//
// apps/sadmin's reads do not go through apps/api — 24 lib modules query Postgres
// directly from RSCs — so AdminGuard cannot see them and the page's own
// requireAdminScope() call IS the access control for the revenue ledger and the
// candidate PII screens. A page that forgets that call is silently readable by
// every staff tier, and nothing about it looks wrong in review.
//
// This repo has no CI and `pnpm lint` does not run, so a failing unit test is
// the only mechanism available that a person cannot forget to run: `pnpm test`
// is in the merge gate (DEVELOPMENT.md §5). Hence a test that reads the actual
// filesystem and the actual page source rather than trusting a hand-kept list.
//
// vitest.config.ts scopes this app's tests to lib/**, which is why this file
// lives beside the map instead of next to the pages it polices.

const AUTHED_DIR = join(__dirname, '..', '..', 'app', '(authed)');

/** Top-level route segments — the directories directly under app/(authed)/. */
function routeSegments(): string[] {
  return readdirSync(AUTHED_DIR)
    .filter((entry) => statSync(join(AUTHED_DIR, entry)).isDirectory())
    .sort();
}

/** Every page.tsx under app/(authed)/, as paths relative to that directory. */
function pageFiles(dir = AUTHED_DIR, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...pageFiles(full, prefix ? `${prefix}/${entry}` : entry));
    } else if (entry === 'page.tsx') {
      out.push(prefix ? `${prefix}/page.tsx` : 'page.tsx');
    }
  }
  return out.sort();
}

describe('every route segment declares a scope', () => {
  it('has a ROUTE_SCOPES entry for each directory under app/(authed)/', () => {
    const missing = routeSegments().filter((seg) => !(seg in ROUTE_SCOPES));
    expect(
      missing,
      `Add these segments to lib/roles/scope-map.ts, then call requireAdminScope() in their pages: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('has no stale ROUTE_SCOPES entry for a segment that no longer exists', () => {
    // A stale entry is harmless at runtime but it is how the map stops being a
    // reliable inventory of the console, which is the only thing making the
    // check above meaningful.
    const segments = new Set(routeSegments());
    const stale = Object.keys(ROUTE_SCOPES).filter((key) => !segments.has(key));
    expect(stale, `Remove these from ROUTE_SCOPES: ${stale.join(', ')}`).toEqual([]);
  });

  it('only references modules and levels that exist in the taxonomy', () => {
    for (const [segment, scope] of Object.entries(ROUTE_SCOPES)) {
      if (scope === 'ANY_STAFF') continue;
      expect(ADMIN_MODULES, `${segment}.module`).toContain(scope.module);
      expect(ADMIN_ACCESS_LEVELS, `${segment}.level`).toContain(scope.level);
    }
  });
});

describe('every page actually calls its gate', () => {
  // The check that catches the real failure. The one above proves the map is
  // complete; this proves the pages USE it. A page can be in a mapped segment
  // and still be wide open if nobody wrote the call.
  it('calls requireAdminScope() or requireAdminStaff() in each page.tsx', () => {
    const ungated: string[] = [];
    for (const rel of pageFiles()) {
      const src = readFileSync(join(AUTHED_DIR, rel), 'utf8');
      const gated =
        /await\s+requireAdminScope\(/.test(src) || /await\s+requireAdminStaff\(/.test(src);
      if (!gated) ungated.push(rel);
    }
    expect(
      ungated,
      `These pages read data with no Layer 2 scope check: ${ungated.join(', ')}`,
    ).toEqual([]);
  });

  // Guards against the subtler mistake: calling the gate with a module that is
  // not the one its segment declares, which reads as correct at a glance.
  it('passes its own segment’s module to requireAdminScope()', () => {
    const mismatched: string[] = [];
    for (const rel of pageFiles()) {
      const segment = rel.split('/')[0]!;
      const scope = ROUTE_SCOPES[segment];
      if (!scope || scope === 'ANY_STAFF') continue;
      const src = readFileSync(join(AUTHED_DIR, rel), 'utf8');
      const call = src.match(/await\s+requireAdminScope\(\s*'([a-z_]+)'\s*,\s*'([A-Z_]+)'\s*\)/);
      if (!call) {
        mismatched.push(`${rel} (no parseable requireAdminScope call)`);
        continue;
      }
      if (call[1] !== scope.module) {
        mismatched.push(`${rel} uses '${call[1]}' but its segment declares '${scope.module}'`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe('scope map content', () => {
  it('keeps the money and PII consoles behind a module, never ANY_STAFF', () => {
    // These four are the reason Layer 2 carries weight in this app at all.
    for (const segment of ['transactions', 'subscriptions', 'candidates', 'employers']) {
      expect(ROUTE_SCOPES[segment], segment).not.toBe('ANY_STAFF');
    }
  });

  it('requires a full grant to load the OTP reveal console', () => {
    // Its whole purpose is to surface a live login code, so there is no
    // meaningful view-only version of the screen to hand out.
    expect(ROUTE_SCOPES['otp-sessions']).toEqual({ module: 'otp_reveal', level: 'EDIT' });
  });

  it('leaves the dashboard reachable by any active staff member', () => {
    // It is the post-login landing page; gating it on a module would bounce a
    // Support Admin off the first screen they ever see.
    expect(ROUTE_SCOPES.dashboard).toBe('ANY_STAFF');
  });
});
