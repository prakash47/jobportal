// Pure display helpers for the recruiter Jobs list (used by JobsTable).
// Kept side-effect-free so the formatting logic is easy to reason about and
// reuse between the desktop table and the mobile card layout.

export type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';

/**
 * Posting product/type (Prisma enum `JobType`). Surfaced as the "Category"
 * filter on the Jobs list. FREE is the only type live on Day 0; HOT_VACANCY +
 * SMB are the paid products (gated OFF), INTERNSHIP is its own track. The label
 * map is the single source of truth for both the filter dropdown and the
 * server-side param allow-list, so the two can never drift.
 */
export type JobCategory = 'FREE' | 'HOT_VACANCY' | 'SMB' | 'INTERNSHIP';

export const JOB_TYPE_LABELS: Record<JobCategory, string> = {
  FREE: 'Free',
  HOT_VACANCY: 'Hot Vacancy',
  SMB: 'SMB',
  INTERNSHIP: 'Internship',
};

/**
 * Human-readable location for a posting, given its work mode + resolved
 * city/locality names (the recruiter page resolves these via a Prisma join).
 *
 *  - REMOTE  → "Remote"
 *  - HYBRID  → "{place} · Hybrid"  (or just "Hybrid" when no place is set)
 *  - ONSITE  → "{place}"           (or "—" when no place is set, e.g. drafts)
 *
 * `place` is "{locality}, {city}" when both are present, otherwise whichever
 * one exists.
 */
export function formatJobLocation(input: {
  workMode: WorkMode;
  cityName: string | null;
  localityName: string | null;
}): string {
  const { workMode, cityName, localityName } = input;

  const place =
    localityName && cityName
      ? `${localityName}, ${cityName}`
      : (cityName ?? localityName ?? null);

  if (workMode === 'REMOTE') return 'Remote';
  if (workMode === 'HYBRID') return place ? `${place} · Hybrid` : 'Hybrid';
  return place ?? '—';
}

/** `dd MMM yyyy` in IST, or an em-dash when the date is absent. */
export function formatListDate(d: Date | string | null): string {
  return d
    ? new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}
