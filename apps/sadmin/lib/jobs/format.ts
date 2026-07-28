// Pure formatting for the job review queue. No JSX, no DOM, no `new Date()` —
// every function that needs "now" takes it as an argument, so the callers pass
// one shared anchor instant and the tests are deterministic. Same discipline as
// lib/dashboard/chart.ts and the trend queries.

const IST = 'Asia/Kolkata';

/**
 * Whole days a job has been waiting on a reviewer. Floors, so a job submitted
 * four hours ago reads 0 ("Today") rather than being rounded up to a day it has
 * not actually waited — a queue that overstates its own backlog is worse than
 * one that understates it.
 *
 * Returns null when there is no submission timestamp, which is the honest answer
 * for a row that reached the queue before this column existed.
 */
export function waitingDays(submittedAt: string | Date | null, now: Date): number | null {
  if (submittedAt == null) return null;
  const then = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  const ms = then.getTime();
  if (!Number.isFinite(ms)) return null;
  const elapsed = now.getTime() - ms;
  // A clock skew between the API host and this one can produce a small negative;
  // clamp rather than render "-0 days".
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

export function formatWaiting(days: number | null): string {
  if (days == null) return 'Unknown';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * Salary band in lakhs per annum. Values are stored in PAISE (1 rupee = 100
 * paise, 1 lakh = 100,000 rupees), so the divisor is 10,000,000.
 *
 * Returns null when neither bound is set — the Job model has no "salary
 * confidential" flag, so both-null means undisclosed, and the caller says that
 * in words rather than rendering an empty range.
 */
export function formatSalaryLpa(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise == null && maxPaise == null) return null;
  const toLpa = (p: number): string => {
    const lpa = p / 10_000_000;
    // One decimal, but drop a trailing ".0" so a clean band reads "8 – 12 LPA".
    return (Math.round(lpa * 10) / 10).toString();
  };
  if (minPaise != null && maxPaise != null) {
    return minPaise === maxPaise
      ? `₹${toLpa(minPaise)} LPA`
      : `₹${toLpa(minPaise)} – ₹${toLpa(maxPaise)} LPA`;
  }
  const single = minPaise ?? maxPaise;
  return single == null ? null : `₹${toLpa(single)}+ LPA`;
}

export function formatExperience(minYears: number | null, maxYears: number | null): string | null {
  if (minYears == null && maxYears == null) return null;
  if (minYears != null && maxYears != null) {
    return minYears === maxYears ? `${minYears} yrs` : `${minYears} – ${maxYears} yrs`;
  }
  return minYears != null ? `${minYears}+ yrs` : `Up to ${maxYears} yrs`;
}

/**
 * Dates render in IST because the whole product is India-facing and the rest of
 * this portal already buckets by that zone. Formatting on the server is safe
 * here: these are server components, so there is no client render to disagree
 * with (the seeker dashboard hit exactly that hydration mismatch by formatting
 * a date in a client component).
 */
export function formatDateIst(value: string | Date | null): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeIst(value: string | Date | null): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const KYC_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  PENDING: 'Verification pending',
  REJECTED: 'Verification rejected',
  NOT_SUBMITTED: 'Not verified',
};

/** Company verification state, in the reviewer's words rather than the enum's. */
export function formatKycStatus(status: string): string {
  return KYC_LABEL[status] ?? 'Not verified';
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Internship',
  TEMPORARY: 'Temporary',
};

const WORK_MODE_LABEL: Record<string, string> = {
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};

export function formatEmploymentType(value: string): string {
  return EMPLOYMENT_LABEL[value] ?? value;
}

export function formatWorkMode(value: string): string {
  return WORK_MODE_LABEL[value] ?? value;
}
