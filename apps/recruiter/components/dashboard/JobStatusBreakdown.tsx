import Link from 'next/link';
import { JOB_STATUS_META, type JobStatus } from '../jobs/JobStatusBadge';

// Every posting the company owns, split by lifecycle state, each row drilling
// into the Jobs list already filtered to it (/jobs?status=…) — the same
// destination the sidebar's "Draft Jobs" item uses.
//
// Every state always renders, because all five are now reachable and a visible
// zero is information. (Expiry is real: the job-lifecycle worker sweeps past-due
// postings to EXPIRED daily.)
//
// PENDING_MODERATION used to be excluded and shown only when it held rows, on
// the grounds that it was unreachable while moderation.jobs.enabled was OFF.
// That flag now ships ON, so every newly published job passes through this state
// — hiding the row at zero would mean a recruiter whose queue had just cleared
// saw no trace that review is part of publishing at all.
const ALWAYS_SHOWN: readonly JobStatus[] = [
  'ACTIVE',
  'DRAFT',
  'PENDING_MODERATION',
  'EXPIRED',
  'CLOSED',
];
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
                  // "Open: 3 jobs" rather than "3 open jobs" — the latter
                  // template produced "3 under review jobs" once the moderation
                  // label became a phrase rather than a single adjective. This
                  // form also matches how the row reads visually (label left,
                  // count right) and works for all five states.
                  aria-label={`${label}: ${value} ${value === 1 ? 'job' : 'jobs'}`}
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
