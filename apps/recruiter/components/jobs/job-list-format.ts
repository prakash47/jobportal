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

// ---------------------------------------------------------------------------
// Job Detail page helpers (SRS §4.9). These mirror the seeker app's
// apps/web/lib/job/format.ts conventions so salary/experience/employment read
// identically across the public site and the recruiter portal. They are copied
// (not imported) because that module is app-local to apps/web — the reads/writes
// split + app isolation keep the two Next apps from importing each other's lib
// (see the "web untouched" invariant). Keep the two in sync if either changes.
// ---------------------------------------------------------------------------

/** Employment nature (Prisma enum `EmploymentType`) — the "Job Type" a candidate
 * sees (Full-time / Part-time / …), distinct from `JobType` (the posting product). */
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACTOR: 'Contract',
  INTERN: 'Internship',
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};

/**
 * paise → "₹N–M LPA" (or "₹N.N Cr" past a crore). Decimals only when they carry
 * information, so ₹32 LPA / ₹12.5 LPA / ₹1.2 Cr. Returns null when BOTH bounds
 * are unset — the Job model has no explicit "confidential" flag, so the detail
 * page treats a fully-unset range as undisclosed and shows an industry-standard
 * note instead (SRS §4.9 salary section).
 */
export function formatSalaryLpa(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise === null && maxPaise === null) return null;
  const toLpa = (p: number) => {
    const lakhs = p / 100 / 100_000;
    if (lakhs >= 100) {
      const cr = lakhs / 100;
      return `${Number.isInteger(cr) ? cr : cr.toFixed(1)} Cr`;
    }
    return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}`;
  };
  if (minPaise !== null && maxPaise !== null) return `₹${toLpa(minPaise)}–${toLpa(maxPaise)} LPA`;
  if (minPaise !== null) return `₹${toLpa(minPaise)}+ LPA`;
  return `Up to ₹${toLpa(maxPaise as number)} LPA`;
}

/** Experience range in years → "3–5 yrs" / "5+ yrs" / "Up to 2 yrs"; null if both unset. */
export function formatExperienceYears(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

/**
 * Whole days from now until `expiresAt` (negative if already past, null when no
 * expiry is set). Epoch math only — timezone-agnostic and safe in a server
 * component. Floors toward the day, matching the codebase's `postedAgo`
 * convention: an expiry later *today* (< 24h future) reads as 0 ("Expires
 * today"), and one that passed within the last 24h reads as -1 (already
 * expired) — so the count never overstates the time remaining.
 */
export function daysUntilExpiry(expiresAt: Date | string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}
