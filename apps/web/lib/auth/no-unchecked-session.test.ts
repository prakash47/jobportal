// Regression guard for the anonymous-render crash (bugfix/anon-render-null-session).
//
// THE BUG THIS EXISTS TO PREVENT
// ------------------------------
// Nine seeker pages opened with:
//
//     const session = (await readUserFromCookie())!;
//
// above a comment asserting "the layout's requireUser already redirects
// anonymous users". That assertion is false. In the App Router a layout and its
// child page render CONCURRENTLY — the layout's redirect() does not gate the
// page body — so every logged-out request ran the page with no session, the `!`
// lied, and `session.sub` threw a TypeError. The response was still a 307 (the
// redirect wins the HTTP status), which is exactly why it survived: the visible
// behaviour was correct and only the server log showed the crash.
//
// It is not a rule a reviewer can be relied on to notice, and this repo has no
// working ESLint setup (`next lint` resolves to no config), so a lint rule would
// be theatre. `pnpm test` IS in the merge gate — so the guard lives here.
//
// WHAT IS AND IS NOT CAUGHT
// -------------------------
// This is source-text analysis, not type analysis. It catches the shape that
// actually shipped (assert-or-cast the session away at the point of use) and the
// structural case (a private page reaching for the raw reader at all). It cannot
// catch a null deref split across statements — `const s = await
// readUserFromCookie(); ... s!.sub`. Rule 2 is what makes that unlikely: under a
// guarded layout the raw reader is banned outright, so there is nothing to
// launder.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP_DIR = join(WEB_ROOT, 'app');
const LIB_DIR = join(WEB_ROOT, 'lib');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out comments so prose ABOUT the banned pattern does not trip the guard —
 * the fix commit itself explains `(await readUserFromCookie())!` in a comment.
 *
 * `//` preceded by `:` is left alone so a `'http://…'` literal is not treated as
 * the start of a comment. Mangling a string can only ever hide a match on that
 * same line, never invent one, so the failure mode is a missed detection rather
 * than a false alarm — the right way round for a guard that blocks merges.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const rel = (f: string) => relative(WEB_ROOT, f).replaceAll('\\', '/');

const SOURCE_FILES = [...walk(APP_DIR), ...walk(LIB_DIR)];

/**
 * Every helper that hands back the signed-in identity and CAN return null.
 *
 * `getHeaderUser` is here because it is the obvious way to launder around a
 * ban on `readUserFromCookie` alone — it wraps that same call, so
 * `(await getHeaderUser())!` is the identical lie wearing a different name.
 * `requireUser` / `requireAdmin` are deliberately absent: they never return
 * null, so there is nothing to assert about them.
 */
const NULLABLE_SESSION_READERS = ['readUserFromCookie', 'getHeaderUser'] as const;
const READERS = NULLABLE_SESSION_READERS.join('|');

describe('rule 1 — the session is never asserted or cast away', () => {
  // `(await readUserFromCookie())!`, `readUserFromCookie()!`, and the cast
  // spelling `(await readUserFromCookie()) as AccessClaims` — all three say
  // "trust me, it is not null" about a value that IS null for every logged-out
  // request.
  const BANNED = new RegExp(`(?:${READERS})\\s*\\(\\s*\\)\\s*\\)?\\s*(?:!|as\\s)`);

  it('finds the source tree it is supposed to be scanning', () => {
    // A guard that passes because it scanned nothing is worse than no guard.
    expect(SOURCE_FILES.length).toBeGreaterThan(50);
    expect(SOURCE_FILES.some((f) => rel(f) === 'app/profile/page.tsx')).toBe(true);
  });

  it('no file asserts or casts away a nullable session read', () => {
    const offenders = SOURCE_FILES.filter((f) =>
      BANNED.test(stripComments(readFileSync(f, 'utf8'))),
    ).map(rel);

    expect(
      offenders,
      `${NULLABLE_SESSION_READERS.join(' and ')} return null for every logged-out ` +
        'request, and a page body runs even when an ancestor layout is redirecting. ' +
        'Use requireUser() (lib/auth/require-user.ts) — it returns non-null claims ' +
        'or redirects.',
    ).toEqual([]);
  });

  it('actually detects the shape that shipped', () => {
    // Proves the regex is not vacuous — the exact lines this bugfix removed.
    expect(BANNED.test('  const session = (await readUserFromCookie())!;')).toBe(true);
    expect(BANNED.test('  const u = (await readUserFromCookie())!.sub;')).toBe(true);
    expect(BANNED.test('  const s = (await readUserFromCookie()) as AccessClaims;')).toBe(true);
    // The laundering variant: same lie, different helper.
    expect(BANNED.test('  const session = { sub: (await getHeaderUser())!.email };')).toBe(true);
    // ...and does not fire on the correct, null-checked usage.
    expect(BANNED.test('  const user = await readUserFromCookie();')).toBe(false);
    expect(BANNED.test('  if (!(await readUserFromCookie())) return null;')).toBe(false);
    expect(BANNED.test('  const user = await getHeaderUser();')).toBe(false);
    // requireUser() never returns null, so asserting on it is not the same bug
    // and must not be flagged (it would only ever be redundant, not wrong).
    expect(BANNED.test('  const session = await requireUser();')).toBe(false);
  });

  it('ignores the pattern when it appears in a comment', () => {
    const commented = '// we used to write (await readUserFromCookie())! here\nconst x = 1;';
    expect(BANNED.test(stripComments(commented))).toBe(false);
  });
});

describe('rule 2 — private pages guard themselves', () => {
  // Derived, not hardcoded: any layout that calls requireUser()/requireAdmin()
  // marks its whole subtree private, so a NEW guarded section is covered the day
  // it is added without anyone remembering to update this list.
  const GUARDED_ROOTS = walk(APP_DIR)
    .filter((f) => /(^|[\\/])layout\.tsx$/.test(f))
    .filter((f) => /require(User|Admin)\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(0, f.lastIndexOf('layout.tsx')));

  const guardedPages = walk(APP_DIR).filter(
    (f) => /(^|[\\/])page\.tsx$/.test(f) && GUARDED_ROOTS.some((root) => f.startsWith(root)),
  );

  it('discovers the guarded route trees', () => {
    const roots = GUARDED_ROOTS.map((r) => rel(r));
    // /alerts is deliberately absent: its layout tolerates anonymous users so
    // the emailed unsubscribe link works after the JWT cookie has expired.
    expect(roots).toEqual(
      expect.arrayContaining([
        'app/admin',
        'app/applications',
        'app/profile',
        'app/saved-jobs',
        'app/settings',
      ]),
    );
    expect(guardedPages.length).toBeGreaterThan(8);
  });

  it('no page under a guarded layout reaches for a nullable session reader', () => {
    // This is the rule that survives laundering. Rule 1 matches an assertion at
    // the point of use, so it misses a split across statements (`const s = await
    // readUserFromCookie(); … s!.sub`). Rule 2 does not care HOW the value is
    // used — under a guarded layout the nullable readers are simply off-limits,
    // so there is nothing to launder in the first place.
    const banned = new RegExp(READERS);
    const offenders = guardedPages
      .filter((f) => banned.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel);

    expect(
      offenders,
      'A page under a requireUser()/requireAdmin() layout is private, and its body ' +
        'still executes while that layout is redirecting. Call requireUser() here ' +
        'too rather than reading the cookie directly.',
    ).toEqual([]);
  });
});
