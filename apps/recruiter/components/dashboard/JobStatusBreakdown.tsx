import Link from 'next/link';
import { JOB_STATUS_META, type JobStatus } from '../jobs/JobStatusBadge';

// Every posting the company owns, split by lifecycle state, each row drilling
// into the Jobs list already filtered to it (/jobs?status=…) — the same
// destination the sidebar's "Draft Jobs" item uses.
//
// Open, Draft, Expired and Closed always render — all four are reachable states
// a recruiter acts on, and a visible zero is information. (Expiry is real: the
// job-lifecycle worker sweeps past-due postings to EXPIRED daily.)
// PENDING_MODERATION is the exception: it is unreachable while
// moderation.jobs.enabled is OFF, so it appears only if it actually holds rows.
const ALWAYS_SHOWN: readonly JobStatus[] = ['ACTIVE', 'DRAFT', 'EXPIRED', 'CLOSED'];
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
