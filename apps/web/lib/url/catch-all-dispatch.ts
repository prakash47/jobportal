// Pattern-matcher for the app/[...path] catch-all dispatcher.
//
// The three root-level SEO landings (/jobs-in-X, /X-jobs, /working-at-X)
// can't coexist as separate dynamic folders in Next 16 (per-directory
// dynamic-segment uniqueness — chip #5). The catch-all at
// apps/web/app/[...path]/page.tsx delegates segment-shape detection to
// this pure function so it's unit-testable without spinning up Next.

export type Dispatch =
  | { kind: 'city'; segment: string }
  | { kind: 'skill'; segment: string }
  | { kind: 'skillCity'; skill: string; city: string }
  | { kind: 'workingAt'; segment: string };

// Order matters:
//   1. `working-at-` prefix (most specific prefix)
//   2. `jobs-in-` prefix (next most specific)
//   3. `-jobs-in-` middle marker (skill×city — composed, checked before
//      plain skill so a URL like `python-jobs-in-bangalore` doesn't get
//      misinterpreted as "skill: python-jobs-in-bangalore")
//   4. `-jobs` suffix (plain skill)
//
// path.length > 1 returns null — this catch-all only handles
// single-segment SEO landings; anything deeper is genuinely not-found.
//
// Non-greedy first capture in the skill×city regex so `node-js-jobs-in-bangalore`
// splits at the FIRST `-jobs-in-` (skill = "node-js", city = "bangalore")
// rather than the last.
const SKILL_CITY_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-jobs-in-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;

export function dispatch(path: string[] | undefined): Dispatch | null {
  if (!path || path.length !== 1) return null;
  const segment = path[0]!;

  if (segment.startsWith('working-at-') && segment.length > 'working-at-'.length) {
    return { kind: 'workingAt', segment: segment.slice('working-at-'.length) };
  }
  if (segment.startsWith('jobs-in-') && segment.length > 'jobs-in-'.length) {
    return { kind: 'city', segment: segment.slice('jobs-in-'.length) };
  }
  const skillCityMatch = SKILL_CITY_RE.exec(segment);
  if (skillCityMatch) {
    return { kind: 'skillCity', skill: skillCityMatch[1]!, city: skillCityMatch[2]! };
  }
  if (segment.endsWith('-jobs') && segment.length > '-jobs'.length) {
    return { kind: 'skill', segment: segment.slice(0, segment.length - '-jobs'.length) };
  }
  return null;
}
