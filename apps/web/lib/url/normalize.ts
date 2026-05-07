// Pure URL-normalisation helpers shared by middleware + the buildCanonical
// helper. Each fn returns { changed } so the caller knows whether to redirect.

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'msclkid',
  'ref',
  'mc_cid',
  'mc_eid',
]);

export function lowercasePath(pathname: string): { pathname: string; changed: boolean } {
  const lower = pathname.toLowerCase();
  return { pathname: lower, changed: pathname !== lower };
}

export function stripTrailingSlash(pathname: string): { pathname: string; changed: boolean } {
  if (pathname === '/' || !pathname.endsWith('/')) return { pathname, changed: false };
  return { pathname: pathname.replace(/\/+$/, ''), changed: true };
}

// Sorts the cities in a `/jobs-in-a-and-b-and-c` (or `/{skill}-jobs-in-...`) path.
// Idempotent: returns changed:false when already sorted.
export function sortMultiCitySegment(pathname: string): { pathname: string; changed: boolean } {
  // Find the last `jobs-in-` in the path; the cities are everything after it
  // up to the next `/` (or end of string).
  const m = pathname.match(/^(.*\/(?:[a-z0-9-]+-)?jobs-in-)([a-z0-9-]+)(\/.*)?$/);
  if (!m) return { pathname, changed: false };
  const prefix = m[1]!;
  const citiesPart = m[2]!;
  const suffix = m[3] ?? '';
  if (!citiesPart.includes('-and-')) return { pathname, changed: false };

  const cities = citiesPart.split('-and-');
  if (cities.some((c) => c.length === 0)) return { pathname, changed: false };
  const sorted = [...cities].sort();
  if (cities.every((c, i) => c === sorted[i])) return { pathname, changed: false };
  return { pathname: `${prefix}${sorted.join('-and-')}${suffix}`, changed: true };
}

// Removes tracking params, then sorts what remains alphabetically.
export function normalizeQuery(input: URLSearchParams): {
  searchParams: URLSearchParams;
  changed: boolean;
} {
  const before = input.toString();
  const cleaned = new URLSearchParams();
  for (const [k, v] of input) {
    if (TRACKING_PARAMS.has(k.toLowerCase())) continue;
    cleaned.append(k, v);
  }
  // Sort: collect, sort, rebuild.
  const sortedEntries = Array.from(cleaned.entries()).sort(([a], [b]) => a.localeCompare(b));
  const out = new URLSearchParams();
  for (const [k, v] of sortedEntries) out.append(k, v);
  return { searchParams: out, changed: out.toString() !== before };
}

export const _testing = { TRACKING_PARAMS };
