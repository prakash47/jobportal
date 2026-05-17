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
  | { kind: 'workingAt'; segment: string };

// Order matters: `working-at-` and `jobs-in-` are prefix-matched first;
// the `-jobs` suffix is checked last. path.length > 1 returns null —
// this catch-all only handles single-segment SEO landings, anything
// deeper is genuinely not-found.
export function dispatch(path: string[] | undefined): Dispatch | null {
  if (!path || path.length !== 1) return null;
  const segment = path[0]!;

  if (segment.startsWith('working-at-') && segment.length > 'working-at-'.length) {
    return { kind: 'workingAt', segment: segment.slice('working-at-'.length) };
  }
  if (segment.startsWith('jobs-in-') && segment.length > 'jobs-in-'.length) {
    return { kind: 'city', segment: segment.slice('jobs-in-'.length) };
  }
  if (segment.endsWith('-jobs') && segment.length > '-jobs'.length) {
    return { kind: 'skill', segment: segment.slice(0, segment.length - '-jobs'.length) };
  }
  return null;
}
