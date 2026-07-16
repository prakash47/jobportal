// Public seeker-site origin for cross-app links (Preview / View public job
// page / Share). NEXT_PUBLIC_WEB_URL is the recruiter-app convention for
// pointing at the seeker site (see lib/auth/require-recruiter.ts); the API
// uses the server-only WEB_URL for the same purpose.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

/**
 * Absolute URL of a job's public seeker-site page. `canonicalSlug` is a DB
 * column (`<slugified-title>-<id>`, set at creation by the API), so no slug
 * computation happens here — and the seeker page 308-redirects any drift to
 * the canonical form as a safety net.
 */
export function buildPublicJobUrl(canonicalSlug: string): string {
  return `${WEB_URL}/job/${canonicalSlug}`;
}
