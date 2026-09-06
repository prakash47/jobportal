import { normalizeQuery, stripTrailingSlash } from '../url/normalize';

// SRS §6.3 — every page sets a self-referencing <link rel="canonical">.
// `buildCanonical` returns an absolute URL using NEXT_PUBLIC_WEB_URL as origin,
// strips tracking params, and sorts what remains alphabetically.
//
// Trailing slash is removed even though next.config has trailingSlash:false —
// belt + braces in case a caller hand-builds an off-canon URL.

/**
 * Params that are UI state, not content — excluded from the canonical URL.
 *
 * Distinct from TRACKING_PARAMS in url/normalize.ts, and the difference matters:
 * a tracking param is 301'd out of the address bar entirely by the middleware,
 * so the page never sees it. These must SURVIVE the redirect (the page reads
 * them) while still being absent from the canonical, or one job posting would
 * advertise a different canonical URL per entry point and split its own ranking
 * signals.
 *
 * `from` marks where the visitor came from, so /job/x and /job/x?from=applications
 * are the same document and must say so.
 */
const NON_CANONICAL_PARAMS = new Set(['from']);
export function buildCanonical(
  pathname: string,
  search?: string | URLSearchParams,
): string {
  const origin =
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.WEB_URL ??
    'http://localhost:3000';

  const { pathname: cleanedPath } = stripTrailingSlash(pathname.toLowerCase());

  const params =
    search === undefined
      ? null
      : typeof search === 'string'
        ? new URLSearchParams(search)
        : search;

  let queryString = '';
  if (params) {
    const { searchParams } = normalizeQuery(params);
    for (const key of NON_CANONICAL_PARAMS) searchParams.delete(key);
    const s = searchParams.toString();
    if (s) queryString = `?${s}`;
  }

  return `${origin}${cleanedPath}${queryString}`;
}
