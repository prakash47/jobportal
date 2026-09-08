export interface ExperienceSpan {
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  isCareerBreak: boolean;
}

/** Fixed label stored in `companyName` for a career-break row. See the schema comment. */
export const CAREER_BREAK_COMPANY = 'Career break';

interface Interval {
  start: number;
  end: number;
}

/**
 * Total professional experience across every role, in whole months.
 *
 * Overlapping roles are merged rather than summed. Two concurrent jobs, or a
 * consulting engagement running alongside a staff role, are not two separate
 * careers — adding them would tell a recruiter someone has twelve years when
 * they have seven, which is the kind of number a recruiter checks.
 *
 * Career breaks are excluded: a break is recorded so a gap has context, not so
 * it counts as experience.
 */
export function totalExperienceMonths(spans: ExperienceSpan[], now: Date = new Date()): number {
  const intervals: Interval[] = [];

  for (const span of spans) {
    if (span.isCareerBreak) continue;
    const start = new Date(span.startDate).getTime();
    if (Number.isNaN(start)) continue;

    // A current role runs to today. A row with neither an end date nor the
    // current flag is malformed; treating it as a single instant keeps it from
    // silently inflating the total.
    const rawEnd = span.isCurrent ? now.getTime() : span.endDate ? new Date(span.endDate).getTime() : start;
    const end = Number.isNaN(rawEnd) ? start : rawEnd;
    if (end < start) continue;
    intervals.push({ start, end });
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last !== undefined && interval.start <= last.end) {
      // Overlapping or touching — extend rather than append.
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push({ ...interval });
    }
  }

  return merged.reduce((sum, i) => sum + wholeMonthsBetween(new Date(i.start), new Date(i.end)), 0);
}

/**
 * Whole calendar months from `start` to `end`.
 *
 * Deliberately not `elapsedMs / averageMonthMs`: two years to the day is 730
 * days, an average month is 30.437 days, and the division floors to **23** —
 * so someone with exactly two years of experience would have been shown
 * "1 yr 11 mos". Calendar arithmetic has no such gap.
 */
function wholeMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  // Not a full month yet if the day-of-month has not come round again.
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** "5 yrs 6 mos", "11 mos", "1 yr" — omitting zero parts. */
export function formatExperience(months: number): string {
  if (months <= 0) return '0 mos';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

/**
 * Sort for display: current roles first, then newest start date.
 *
 * The page used to instruct the user to do this by hand ("List your roles in
 * reverse-chronological order") while the query already did it — the ordering
 * is ours to guarantee, not theirs to maintain.
 */
export function sortExperience<T extends { startDate: string; isCurrent: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
}
