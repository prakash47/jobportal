// Pure helpers used by FlagEditSidePanel. Extracted so they can be unit-
// tested under apps/web/vitest.config.ts (which only globs lib/**).

export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Order-insensitive equality for primitives. Used for tiers + user IDs
// where the DB array order isn't significant. If the DB row was ever
// written with a non-canonical order (e.g. seeds, manual SQL, prior ad-
// hoc PATCH), a strict array compare would produce a spurious PATCH on
// every save with no real change — that adds audit-log noise for
// changes that didn't actually happen.
export function setEqual<T extends string | number>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  for (const item of b) {
    if (!seen.has(item)) return false;
  }
  return true;
}

export type ParseUserIdsResult =
  | { ids: number[]; error: null }
  | { ids: number[]; error: string };

export function parseUserIds(raw: string): ParseUserIdsResult {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const out: number[] = [];
  for (const t of tokens) {
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) {
      return { ids: [], error: `Not a positive integer: "${t}"` };
    }
    if (!out.includes(n)) out.push(n);
  }
  return { ids: out, error: null };
}
