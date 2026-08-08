// Re-derive the origin of an asset URL we minted ourselves.
//
// THE PROBLEM
//
// `StorageService.getPublicUrl` returns an ABSOLUTE url and that value is
// written into the database (`Company.logoUrl`). With `R2_PUBLIC_URL` unset —
// the documented local setup, and the state of every environment until R2 is
// provisioned — it returns `${API_URL}/media/<key>`, so the row permanently
// records `http://localhost:4000/media/...`.
//
// Provisioning R2 afterwards does NOT fix those rows: nothing rewrites them.
// The stale origin then leaks somewhere that matters, because `logoUrl` is not
// only rendered in an <img> — `apps/web` puts it straight into the `logo` field
// of the `Organization` and `JobPosting` JSON-LD that Google reads.
//
// THE FIX
//
// Treat the stored value as a KEY carrier rather than a finished URL. If it was
// minted by us, extract the key and rebuild against whatever base is configured
// right now, so the row self-heals the moment R2 appears. If it was not — a
// seeded external logo, a Google avatar — return it untouched, because we have
// no basis to rewrite someone else's URL.
//
// Measured before writing this: 0 of 12 companies have a non-null `logoUrl`, so
// there is nothing to back-fill. This exists so the first upload cannot create
// the problem, not to repair one that already happened.

/** Bases as configured for the CURRENT process. Both are optional. */
export interface AssetBases {
  /** R2 / CDN public base, e.g. https://cdn.example.com. Trailing slash optional. */
  publicBase?: string | null | undefined;
  /** API origin serving the /media passthrough, e.g. http://localhost:4000. */
  apiBase?: string | null | undefined;
}

const MEDIA_PATH = '/media/';

function trimEnd(base: string): string {
  return base.replace(/\/+$/, '');
}

/**
 * Extract the storage key from a URL we previously minted, or null.
 *
 * Mirrors `StorageService.keyFromPublicUrl`, but takes the bases as arguments
 * so it can run in `apps/web`, which has no StorageService and reads `logoUrl`
 * directly out of Prisma.
 *
 * The `/media/` form is recognised on ANY origin, not just the currently
 * configured one — that is the whole point. A row written when `API_URL` was
 * `http://localhost:4000` has to be recognisable after the API has moved to
 * `https://api.example.com`, or it could never be repaired.
 */
export function storageKeyFromUrl(url: string, bases: AssetBases): string | null {
  if (!url) return null;

  const publicBase = bases.publicBase ? trimEnd(bases.publicBase) : null;
  if (publicBase && url.startsWith(`${publicBase}/`)) {
    return url.slice(publicBase.length + 1) || null;
  }

  // Any absolute http(s) URL whose path begins /media/ is one of ours.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // relative or malformed — not something we minted
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.pathname.startsWith(MEDIA_PATH)) return null;

  const key = decodeURIComponent(parsed.pathname.slice(MEDIA_PATH.length));
  return key || null;
}

/**
 * Rebuild a stored asset URL against the bases configured right now.
 *
 * - null/empty in → null out, so callers can pass an optional column straight
 *   through without a null dance.
 * - A URL we minted → re-pointed at the current CDN, or at the current API's
 *   /media passthrough when no CDN is configured.
 * - Anything else (an external logo, a Google avatar, a relative path) →
 *   returned EXACTLY as given. Rewriting a third party's URL would be worse
 *   than leaving a stale one.
 */
export function resolveStoredAssetUrl(
  stored: string | null | undefined,
  bases: AssetBases,
): string | null {
  if (!stored) return null;

  const key = storageKeyFromUrl(stored, bases);
  if (key === null) return stored;

  const publicBase = bases.publicBase ? trimEnd(bases.publicBase) : null;
  if (publicBase) return `${publicBase}/${key}`;

  const apiBase = bases.apiBase ? trimEnd(bases.apiBase) : null;
  // No base to rebuild against: hand back what we were given rather than
  // inventing a relative URL that an <img> on another origin cannot load.
  if (!apiBase) return stored;

  return `${apiBase}${MEDIA_PATH}${key}`;
}
