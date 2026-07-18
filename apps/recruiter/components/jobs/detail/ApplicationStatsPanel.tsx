import Link from 'next/link';
import { cn } from '@jobportal/ui';
import type { ApplicantFilter } from '../applicant-filter';

export interface ApplicationStatsPanelProps {
  jobId: number;
  /** Total applications received (all statuses). */
  total: number;
  /** New/unread — applications still at APPLIED. */
  newCount: number;
  shortlisted: number;
  rejected: number;
  /** Applicants whose candidate skills overlap the job's required skills. */
  matched: number;
}

interface Stat {
  label: string;
  value: number;
  /** Applicants-list filter this stat deep-links into ('' = all responses). */
  filter: ApplicantFilter | '';
  ariaNoun: string;
}

function applicantsHref(jobId: number, filter: ApplicantFilter | ''): string {
  return filter ? `/jobs/${jobId}/applicants?filter=${filter}` : `/jobs/${jobId}/applicants`;
}

// §5 Application statistics — a live snapshot of hiring activity on the posting.
// Numbers are computed server-side in the page RSC (one application.groupBy +
// one skill-overlap count), so this is a pure presentational panel. Each metric
// deep-links into the applicants list filtered to that subset; a zero renders as
// plain text (no dead click into an empty list — matching the Jobs-list pattern).
export function ApplicationStatsPanel({
  jobId,
  total,
  newCount,
  shortlisted,
  rejected,
  matched,
}: ApplicationStatsPanelProps) {
  const stats: Stat[] = [
    { label: 'New', value: newCount, filter: 'new', ariaNoun: 'new applications' },
    {
      label: 'Shortlisted',
      value: shortlisted,
      filter: 'shortlisted',
      ariaNoun: 'shortlisted candidates',
    },
    { label: 'Rejected', value: rejected, filter: 'rejected', ariaNoun: 'rejected candidates' },
    { label: 'Matches', value: matched, filter: 'matched', ariaNoun: 'matching candidates' },
  ];

  const tileBase = 'rounded-lg border border-[var(--color-border)] px-3 py-3 text-center';

  return (
    <section
      aria-labelledby="application-stats-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="application-stats-heading"
        className="mb-3 text-sm font-semibold text-[var(--color-fg)]"
      >
        Applications
      </h2>

      {/* Total responses — the headline metric. */}
      {total > 0 ? (
        <Link
          href={applicantsHref(jobId, '')}
          aria-label={`${total} total applications — view all applicants`}
          className="flex items-baseline justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-3 transition-colors hover:border-[var(--color-border-strong)]"
        >
          <span className="text-sm text-[var(--color-fg-muted)]">Total received</span>
          <span className="text-2xl font-semibold tabular-nums text-[var(--color-fg)]">
            {total}
          </span>
        </Link>
      ) : (
        <div className="flex items-baseline justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-3">
          <span className="text-sm text-[var(--color-fg-muted)]">Total received</span>
          <span className="text-2xl font-semibold tabular-nums text-[var(--color-fg-muted)]">0</span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map((s) => {
          const body = (
            <>
              <span
                className={cn(
                  'block text-xl font-semibold tabular-nums',
                  s.value === 0 ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]',
                )}
              >
                {s.value}
              </span>
              <span className="mt-0.5 block text-xs leading-tight text-[var(--color-fg-muted)]">
                {s.label}
              </span>
            </>
          );
          return s.value > 0 ? (
            <Link
              key={s.label}
              href={applicantsHref(jobId, s.filter)}
              aria-label={`${s.value} ${s.ariaNoun}`}
              className={cn(
                tileBase,
                'transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]',
              )}
            >
              {body}
            </Link>
          ) : (
            <div key={s.label} className={tileBase}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
