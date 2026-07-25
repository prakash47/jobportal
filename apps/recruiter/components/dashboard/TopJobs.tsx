import Link from 'next/link';
import { JobStatusBadge, JOB_STATUS_META } from '../jobs/JobStatusBadge';
import type { TopJob } from '../../lib/dashboard/queries';

// The company's postings ranked by how many applications they have pulled in —
// the quickest read on what is working and what is not.
//
// Only the viewer's OWN rows link through: the list is company-wide, but
// /jobs/[id] is scoped to the poster (and collaborators) and 404s for everyone
// else, so linking a teammate's job would be a dead click. The Jobs list draws
// exactly this line for the same reason.
export function TopJobs({ jobs }: { jobs: TopJob[] }) {
  return (
    <section
      aria-labelledby="top-jobs-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="top-jobs-heading" className="text-sm font-semibold text-[var(--color-fg)]">
          Top performing jobs
        </h2>
        <Link
          href="/jobs"
          className="text-sm font-medium text-[var(--color-primary-700)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          All jobs
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
          Post a job to start seeing which roles attract the most candidates.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {jobs.map((job) => {
            const title = (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-fg)]">
                {job.title}
              </span>
            );
            const meta = (
              <>
                <JobStatusBadge status={job.status} />
                <span
                  className={
                    job.applications === 0
                      ? 'w-12 shrink-0 text-right text-sm tabular-nums text-[var(--color-fg-muted)]'
                      : 'w-12 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--color-fg)]'
                  }
                >
                  {job.applications.toLocaleString('en-IN')}
                </span>
              </>
            );
            return (
              <li key={job.id}>
                {job.isOwn ? (
                  <Link
                    href={`/jobs/${job.id}`}
                    // Includes the status, which the badge conveys visually —
                    // an aria-label replaces the row's content entirely, so
                    // omitting it would announce status on teammates' unlinked
                    // rows but drop it from your own.
                    aria-label={`${job.title}. ${JOB_STATUS_META[job.status].label}. ${job.applications} applications`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:text-[var(--color-primary-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
                  >
                    {title}
                    {meta}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">
                    {title}
                    {meta}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* fg-muted, not fg-subtle: this is real prose, and fg-subtle lands at
          2.58:1 here — below WCAG AA. fg-subtle is for decorative marks only. */}
      <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-fg-muted)]">
        Ranked by applications received.
      </p>
    </section>
  );
}
