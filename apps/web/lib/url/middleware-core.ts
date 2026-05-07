import { lowercasePath, normalizeQuery, sortMultiCitySegment, stripTrailingSlash } from './normalize';

// Pure logic: given a URL, decide whether to issue a 301 to a canonical form.
// Composing in this order: case → trailing slash → multi-city → query.
// Each step receives the path produced by the previous one, so a single 301
// covers everything (no redirect chains).

export function computeCanonicalRedirect(input: URL): URL | null {
  const out = new URL(input.href);

  let touched = false;

  const lower = lowercasePath(out.pathname);
  if (lower.changed) {
    out.pathname = lower.pathname;
    touched = true;
  }

  const slash = stripTrailingSlash(out.pathname);
  if (slash.changed) {
    out.pathname = slash.pathname;
    touched = true;
  }

  const multi = sortMultiCitySegment(out.pathname);
  if (multi.changed) {
    out.pathname = multi.pathname;
    touched = true;
  }

  const q = normalizeQuery(out.searchParams);
  if (q.changed) {
    out.search = q.searchParams.toString() ? `?${q.searchParams.toString()}` : '';
    touched = true;
  }

  return touched ? out : null;
}
