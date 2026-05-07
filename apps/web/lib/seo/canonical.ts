import { normalizeQuery, stripTrailingSlash } from '../url/normalize';

// SRS §6.3 — every page sets a self-referencing <link rel="canonical">.
// `buildCanonical` returns an absolute URL using NEXT_PUBLIC_WEB_URL as origin,
// strips tracking params, and sorts what remains alphabetically.
//
// Trailing slash is removed even though next.config has trailingSlash:false —
// belt + braces in case a caller hand-builds an off-canon URL.
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
    const s = searchParams.toString();
    if (s) queryString = `?${s}`;
  }

  return `${origin}${cleanedPath}${queryString}`;
}
