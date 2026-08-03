// Pure logic for the Candidate Management console — headline precedence,
// initials, query normalisation and URL building. No JSX, no Prisma, no
// `new Date()`: anything that needs "now" takes it as an argument, so the tests
// are deterministic. Same discipline as lib/employers/format.ts and
// lib/jobs/format.ts.
//
// A "candidate" on this surface is a USER whose role is CANDIDATE — not a
// `Candidate` row. The distinction is load-bearing rather than pedantic; see
// ./queries.ts for the three ways a real registered seeker can have no
// `Candidate` row at all.

/**
 * Candidates per page in the master list. Matches the employer list, the OTP
 * console and the job review queue, so every table in the portal pages alike.
 */
export const CANDIDATES_PAGE_SIZE = 20;

// Page clamping and last-page arithmetic are not candidate-specific — they are
// the offset-pagination rules every table in this portal obeys, and they are
// already unit-tested in ../employers/format.test.ts. Re-exported rather than
// copied, the same call lib/otp-sessions/format.ts makes: the job review queue
// keeps a private third copy, and two clamps that disagree is a silently wrong
// ?page on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';

/**
 * Longest `?q` we act on.
 *
 * `q` is user-controlled and reaches Postgres as a `contains` pattern on an
 * UNINDEXED column, so an unbounded string is an unbounded scan predicate.
 * Truncating rather than rejecting keeps the surface forgiving: a pasted
 * paragraph still searches on its first 100 characters instead of erroring.
 */
const MAX_QUERY_LENGTH = 100;

/**
 * Fold the raw `?q` into the one canonical shape the rest of the feature uses.
 *
 * Returning `undefined` (not `''`) for a blank query is what makes `?q=` and a
 * missing `q` the SAME state — so the where-clause branch, the empty-state copy
 * and the href builder can all be a simple truthiness check, and an empty search
 * box can never produce a URL that differs from a fresh page load.
 *
 * Internal whitespace is collapsed so "priya   sharma" matches a row stored as
 * "priya sharma"; Postgres `contains` is a literal substring match and would
 * otherwise miss it.
 */
export function normalizeQuery(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return undefined;
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Shared by the pagination links and the over-range redirect, so the two can
 * never build different URLs for the same state.
 *
 * Params are emitted in a FIXED order (`q` then `page`) for that reason, and the
 * default page is omitted to keep the canonical URL clean. The active search
 * MUST be carried through — dropping it would silently clear the filter when an
 * admin pages through results.
 *
 * basePath-relative: Next adds '/sadmin' itself.
 */
export function candidatesHref(page: number, q?: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/candidates?${qs}` : '/candidates';
}

/**
 * What this person does, as one line.
 *
 * `headline` is the seeker's own self-description and wins when set;
 * `currentTitle` is the more mechanical fallback. Both are nullable AND the
 * whole `Candidate` row may be absent, so all three misses land on an em dash.
 * Encoded once here so no caller re-derives the precedence.
 */
export function formatHeadline(
  candidate: { headline: string | null; currentTitle: string | null } | null,
): string {
  if (!candidate) return '—';
  return candidate.headline?.trim() || candidate.currentTitle?.trim() || '—';
}

/**
 * Monogram for the avatar: first + last word of the display name.
 *
 * Lifted verbatim from the private copy in app/(authed)/layout.tsx so it is
 * actually reachable by a test. Six inline copies of this already exist across
 * the repo — a seventh is the duplicate-`Accordion` smell, so callers on this
 * surface import this one.
 *
 * Takes the DISPLAY name, not `User.name`: a blank name falls back to the email
 * upstream, and initialling the email is better than rendering '?'.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
