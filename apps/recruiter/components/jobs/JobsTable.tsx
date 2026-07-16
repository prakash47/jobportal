import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@jobportal/ui';
import { CloseJobButton, ReopenJobButton } from './JobActions';
import { JobStatusBadge, type JobStatus } from './JobStatusBadge';
import { formatJobLocation, formatListDate, type WorkMode } from './job-list-format';
import type { ApplicantFilter } from './applicant-filter';
import { JobsSortHeader } from './JobsSortHeader';
import { JOBS_SORT_COLUMNS, type JobsSortColumn, type JobsSortKey } from './jobs-list-params';

export interface JobListRow {
  id: number;
  title: string;
  status: JobStatus;
  postedAt: Date;
  expiresAt: Date | null;
  workMode: WorkMode;
  cityName: string | null;
  localityName: string | null;
  /** Candidate-count metrics for the posting (see the recruiter Jobs page). */
  totalResponses: number;
  newCount: number;
  shortlistedCount: number;
  matchedCount: number;
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
 * The candidate-count columns. Each links to the applicants list filtered to the
 * matching subset (`filter=''` → all responses). `ariaNoun` gives each numeric
 * link a self-describing accessible name instead of a bare number.
 */
const METRICS: {
  key: 'total' | 'new' | 'shortlisted' | 'matched';
  label: string;
  filter: ApplicantFilter | '';
  ariaNoun: string;
}[] = [
  { key: 'total', label: 'Responses', filter: '', ariaNoun: 'total responses' },
  { key: 'new', label: 'New', filter: 'new', ariaNoun: 'new applications' },
  { key: 'shortlisted', label: 'Shortlisted', filter: 'shortlisted', ariaNoun: 'shortlisted candidates' },
  { key: 'matched', label: 'Matches', filter: 'matched', ariaNoun: 'matching candidates' },
];

function metricValue(r: JobListRow, key: (typeof METRICS)[number]['key']): number {
  switch (key) {
    case 'total':
      return r.totalResponses;
    case 'new':
      return r.newCount;
    case 'shortlisted':
      return r.shortlistedCount;
    case 'matched':
      return r.matchedCount;
  }
}

function applicantsHref(id: number, filter: ApplicantFilter | ''): string {
  return filter ? `/jobs/${id}/applicants?filter=${filter}` : `/jobs/${id}/applicants`;
}

/** Close/Reopen only apply for these states, and only to the job's own poster. */
function hasRowAction(status: JobStatus, isOwn: boolean): boolean {
  return isOwn && (status === 'ACTIVE' || status === 'CLOSED' || status === 'EXPIRED');
}

/**
 * `aria-sort` for a sortable column header, derived from the same shared sort
 * keys the client header links parse — so the announced state and the link
 * behaviour can't drift. Omitted (undefined) on columns not currently sorted.
 */
function ariaSortFor(column: JobsSortColumn, sort: JobsSortKey): 'ascending' | 'descending' | undefined {
  const col = JOBS_SORT_COLUMNS[column];
  if (sort === col.asc) return 'ascending';
  if (sort === col.desc) return 'descending';
  return undefined;
}

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
 * Job title: a link to the applicants page ONLY for the job's own poster. The
 * list is company-wide, but that page is owner-private (it 404s when
 * `postedById !== session.sub`), so a teammate's row renders the title unlinked.
 */
function JobLink({
  id,
  isOwn,
  ownClass,
  textClass,
  title,
  children,
}: {
  id: number;
  isOwn: boolean;
  ownClass: string;
  textClass: string;
  title?: string;
  children: ReactNode;
}) {
  if (isOwn) {
    return (
      <Link href={`/jobs/${id}/applicants`} title={title} className={ownClass}>
        {children}
      </Link>
    );
  }
  return (
    <span title={title} className={textClass}>
      {children}
    </span>
  );
}

/** A single metric number: a link into the filtered applicants list for the job's
 * own poster when the count is non-zero, otherwise plain text (a teammate's row,
 * or a zero that would deep-link into an empty list). */
function MetricValue({
  row,
  metric,
}: {
  row: JobListRow;
  metric: (typeof METRICS)[number];
}) {
  const count = metricValue(row, metric.key);
  // Zero uses fg-muted (not fg-subtle) so the number still meets WCAG AA contrast
  // while reading as de-emphasised; non-zero plain (teammate) counts use full fg.
  const numClass = count === 0 ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]';

  if (row.isOwn && count > 0) {
    return (
      <Link
        href={applicantsHref(row.id, metric.filter)}
        aria-label={`${count} ${metric.ariaNoun} for ${row.title}`}
        className="font-medium text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
      >
        {count}
      </Link>
    );
  }
  return <span className={numClass}>{count}</span>;
}

/**
 * Structured list of the company's posted jobs.
 * Desktop (md+): a real table — Job Title · Location · Date Posted · Status ·
 * Responses · New · Shortlisted · Matches · Actions (scrolls horizontally on
 * narrow desktops rather than breaking the layout). The Title / Date Posted /
 * Status headers are clickable sort controls (`sort` drives their aria-sort;
 * mobile gets a separate JobsSortSelect since cards have no headers). Mobile:
 * the same fields stacked as cards, with the four metrics as a compact tile
 * grid.
 */
export function JobsTable({ rows, sort }: { rows: JobListRow[]; sort: JobsSortKey }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      {/* Desktop / tablet table. Focusable region so the horizontal scroll (used
          on narrow desktops / tablets, below min-w) is reachable by keyboard
          even on teammate rows that have no focusable cell (WCAG 2.1.1). */}
      <div
        className="hidden overflow-x-auto md:block"
        role="region"
        aria-label="Jobs — scroll horizontally to see all columns"
        tabIndex={0}
      >
        <table className="w-full min-w-[880px] text-sm">
          <caption className="sr-only">Jobs posted by your company</caption>
          <thead>
            <tr className="text-left">
              <th className={TH} aria-sort={ariaSortFor('title', sort)}>
                <JobsSortHeader column="title" label="Job Title" />
              </th>
              <th className={TH}>Location</th>
              <th className={TH} aria-sort={ariaSortFor('posted', sort)}>
                <JobsSortHeader column="posted" label="Date Posted" />
              </th>
              <th className={TH} aria-sort={ariaSortFor('status', sort)}>
                <JobsSortHeader column="status" label="Status" />
              </th>
              {METRICS.map((mt, i) => (
                <th
                  key={mt.key}
                  className={cn(
                    TH,
                    'px-2 text-right',
                    i === 0 && 'border-l border-[var(--color-border)]',
                  )}
                >
                  {mt.label}
                </th>
              ))}
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
                <td className="max-w-[16rem] px-4 py-3">
                  <JobLink
                    id={r.id}
                    isOwn={r.isOwn}
                    title={r.title}
                    ownClass="block truncate font-medium text-[var(--color-fg)] hover:underline"
                    textClass="block truncate font-medium text-[var(--color-fg)]"
                  >
                    {r.title}
                  </JobLink>
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
                {METRICS.map((mt, i) => (
                  <td
                    key={mt.key}
                    className={cn(
                      'px-2 py-3 text-right tabular-nums',
                      i === 0 && 'border-l border-[var(--color-border)]',
                    )}
                  >
                    <MetricValue row={r} metric={mt} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <RowActions id={r.id} title={r.title} status={r.status} isOwn={r.isOwn} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-[var(--color-border)] md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <JobLink
                id={r.id}
                isOwn={r.isOwn}
                title={r.title}
                ownClass="min-w-0 flex-1 truncate font-medium text-[var(--color-fg)] hover:underline"
                textClass="min-w-0 flex-1 truncate font-medium text-[var(--color-fg)]"
              >
                {r.title}
              </JobLink>
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
            {/* 2×2 on narrow phones so long labels ("Shortlisted") never clip;
                4-across once there's room (≥480px). */}
            <div className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
              {METRICS.map((mt) => {
                const count = metricValue(r, mt.key);
                const linked = r.isOwn && count > 0;
                const tileBase =
                  'rounded-md border border-[var(--color-border)] px-2 py-2 text-center';
                const body = (
                  <>
                    <span
                      className={cn(
                        'block text-base font-semibold tabular-nums',
                        count === 0 ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]',
                      )}
                    >
                      {count}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-[var(--color-fg-muted)]">
                      {mt.label}
                    </span>
                  </>
                );
                return linked ? (
                  <Link
                    key={mt.key}
                    href={applicantsHref(r.id, mt.filter)}
                    aria-label={`${count} ${mt.ariaNoun} for ${r.title}`}
                    className={cn(
                      tileBase,
                      'transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]',
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={mt.key} className={tileBase}>
                    {body}
                  </div>
                );
              })}
            </div>
            {hasRowAction(r.status, r.isOwn) && (
              <div className="mt-3 flex justify-end">
                <RowActions id={r.id} title={r.title} status={r.status} isOwn={r.isOwn} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
