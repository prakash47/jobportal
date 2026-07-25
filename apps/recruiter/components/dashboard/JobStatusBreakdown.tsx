import Link from 'next/link';
import { JOB_STATUS_META, type JobStatus } from '../jobs/JobStatusBadge';

// Every posting the company owns, split by lifecycle state, each row drilling
// into the Jobs list already filtered to it (/jobs?status=…) — the same
// destination the sidebar's "Draft Jobs" item uses.
//
// Open and Draft always render, because they are the two states a recruiter
// acts on daily and a visible zero is information. The other three only render
// when they actually hold something: PENDING_MODERATION is unreachable while
// moderation.jobs.enabled is OFF, and nothing in the system flips a job to
// EXPIRED on its own, so permanently-empty rows would just be noise.
const ALWAYS_SHOWN: readonly JobStatus[] = ['ACTIVE', 'DRAFT'];
const ORDER: readonly JobStatus[] = ['ACTIVE', 'DRAFT', 'PENDING_MODERATION', 'EXPIRED', 'CLOSED'];

export function JobStatusBreakdown({
  jobsByStatus,
  totalJobs,
}: {
  jobsByStatus: Record<JobStatus, number>;
  totalJobs: number;
}) {
  const rows = ORDER.filter((s) => ALWAYS_SHOWN.includes(s) || jobsByStatus[s] > 0);

  return (
    <section
      aria-labelledby="jobs-breakdown-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="jobs-breakdown-heading" className="text-sm font-semibold text-[var(--color-fg)]">
          Jobs by status
        </h2>
        <span className="text-sm tabular-nums text-[var(--color-fg-muted)]">
          {totalJobs.toLocaleString('en-IN')} total
        </span>
      </div>

      <ul className="mt-3 divide-y divide-[var(--color-border)]">
        {rows.map((status) => {
          const value = jobsByStatus[status];
          const label = JOB_STATUS_META[status].label;
          const count = (
            <span
              className={
                value === 0
                  ? 'text-sm tabular-nums text-[var(--color-fg-muted)]'
                  : 'text-sm font-medium tabular-nums text-[var(--color-fg)]'
              }
            >
              {value.toLocaleString('en-IN')}
            </span>
          );
          return (
            <li key={status}>
              {value > 0 ? (
                <Link
                  href={`/jobs?status=${status}`}
                  aria-label={`${value} ${label.toLowerCase()} jobs`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-[var(--color-primary-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
                >
                  <span className="text-[var(--color-fg)]">{label}</span>
                  {count}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-[var(--color-fg-muted)]">{label}</span>
                  {count}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
