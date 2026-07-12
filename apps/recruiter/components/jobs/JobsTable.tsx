import Link from 'next/link';
import { CloseJobButton, ReopenJobButton } from './JobActions';
import { JobStatusBadge, type JobStatus } from './JobStatusBadge';
import { formatJobLocation, formatListDate, type WorkMode } from './job-list-format';

export interface JobListRow {
  id: number;
  title: string;
  status: JobStatus;
  postedAt: Date;
  expiresAt: Date | null;
  workMode: WorkMode;
  cityName: string | null;
  localityName: string | null;
  applicantCount: number;
  /**
   * Whether the current recruiter posted this job. The list is company-wide, but
   * the close/reopen API is own-jobs-only (`getOne` 404s otherwise), so those
   * actions only render for the poster — no button that can't succeed.
   */
  isOwn: boolean;
}

const TH =
  'border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]';

/**
 * Contextual status action — mirrors the old JobRow logic. Only rendered for the
 * job's own poster: the list is company-wide but close/reopen are own-jobs-only
 * at the API, so a teammate's job shows no action button (it would 404).
 */
function RowActions({
  id,
  title,
  status,
  isOwn,
}: {
  id: number;
  title: string;
  status: JobStatus;
  isOwn: boolean;
}) {
  if (!isOwn) return null;
  if (status === 'ACTIVE') return <CloseJobButton id={id} title={title} />;
  if (status === 'CLOSED' || status === 'EXPIRED') return <ReopenJobButton id={id} title={title} />;
  return null;
}

/**
 * Structured list of the recruiter's posted jobs.
 * Desktop (md+): a real table — Job Title · Location · Date Posted · Status ·
 * Applicants · Actions. Mobile: the same fields stacked as cards so nothing is
 * clipped on narrow screens.
 */
export function JobsTable({ rows }: { rows: JobListRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      {/* Desktop / tablet table */}
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Jobs posted by your company</caption>
        <thead>
          <tr className="text-left">
            <th className={TH}>Job Title</th>
            <th className={TH}>Location</th>
            <th className={TH}>Date Posted</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`}>Applicants</th>
            <th className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-bg-muted)]"
            >
              <td className="max-w-[24rem] px-4 py-3">
                <Link
                  href={`/jobs/${r.id}/applicants`}
                  title={r.title}
                  className="block truncate font-medium text-[var(--color-fg)] hover:underline"
                >
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                {formatJobLocation({
                  workMode: r.workMode,
                  cityName: r.cityName,
                  localityName: r.localityName,
                })}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-[var(--color-fg-muted)]">
                {formatListDate(r.postedAt)}
                {r.expiresAt && (
                  <span className="mt-0.5 block text-xs text-[var(--color-fg-subtle)]">
                    Expires {formatListDate(r.expiresAt)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <JobStatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/jobs/${r.id}/applicants`}
                  aria-label={`${r.applicantCount} ${r.applicantCount === 1 ? 'applicant' : 'applicants'}`}
                  className="tabular-nums text-[var(--color-fg-muted)] hover:text-[var(--color-primary-600)] hover:underline"
                >
                  {r.applicantCount}
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <RowActions id={r.id} title={r.title} status={r.status} isOwn={r.isOwn} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-[var(--color-border)] md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/jobs/${r.id}/applicants`}
                title={r.title}
                className="min-w-0 flex-1 truncate font-medium text-[var(--color-fg)] hover:underline"
              >
                {r.title}
              </Link>
              <JobStatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
              {formatJobLocation({
                workMode: r.workMode,
                cityName: r.cityName,
                localityName: r.localityName,
              })}
              <span className="mx-1.5">·</span>
              Posted {formatListDate(r.postedAt)}
              {r.expiresAt && (
                <>
                  <span className="mx-1.5">·</span>
                  Expires {formatListDate(r.expiresAt)}
                </>
              )}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Link
                href={`/jobs/${r.id}/applicants`}
                className="-my-1 inline-block py-1 text-xs font-medium text-[var(--color-primary-600)] hover:underline"
              >
                {r.applicantCount} {r.applicantCount === 1 ? 'applicant' : 'applicants'} →
              </Link>
              <RowActions id={r.id} title={r.title} status={r.status} isOwn={r.isOwn} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
