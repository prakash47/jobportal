import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  JOB_POSTING_TABS,
  JOB_POSTING_TAB_LABEL,
  clampPage,
  firstParam,
  formatJobPostingStatus,
  formatJobPostingsSummary,
  jobPostingDeleteBlockedReason,
  jobPostingDetailHref,
  jobPostingsHref,
  lastPageFor,
  normalizeQuery,
  parseStatusTab,
  type JobPostingTab,
} from '../../../lib/job-postings/format';
import { listJobPostings, type JobPostingListRow } from '../../../lib/job-postings/queries';
import { JobPostingSearchBar } from '../../../components/job-postings/JobPostingSearchBar';
import { DeleteJobPostingButton } from '../../../components/job-postings/DeleteJobPostingButton';

export const metadata: Metadata = {
  title: 'Job Postings — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it, not as we wish it were: a REPEATED key
// (`?q=a&q=b`) arrives as an ARRAY, so all three params go through firstParam /
// parseStatusTab. Typing these as bare strings is what let an array reach
// `raw.trim()` and 500 the sibling /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function JobPostingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = parseStatusTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  const [result, deleteKilled] = await Promise.all([
    listJobPostings(page, status, q),
    // Layer 2 of the flag gate: hide the action the API would refuse anyway.
    // Deliberately does NOT gate the route — the list is read-only and is the
    // only surface that can see a DRAFT or never-moderated posting, so 404ing it
    // because deletion is switched off would take the read surface down too.
    // Layer 3 in AdminJobsService.remove is the enforcement point.
    isFlagEnabled('killswitch.admin_job_delete'),
  ]);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No postings match" would be a lie, and the count, table and pagination all
  // live in the non-empty branch — leaving an admin on a dead end with no
  // control to get back. Redirect to the real last page instead, sharing its
  // href builder with the tabs and the pagination links so the three cannot
  // disagree. The active status and search are carried through; dropping either
  // would silently clear the filter. Guarded on page > 1 so a genuinely empty
  // list still reaches its empty state rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404. This is why /candidates, /employers, /jobs and
  // /otp-sessions all lack one: a constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(jobPostingsHref(status, lastPage, q));
  }

  const isEmpty = result.rows.length === 0;
  // Wording lives in format.ts so it is unit-testable — this is the sentence a
  // screen-reader user hears when a search narrows the list to nothing.
  const summary = formatJobPostingsSummary(result.total, status, q);

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Job Postings
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Every job on the platform, newest first — including drafts and postings that never went
          through review. To act on a job waiting for a decision, use Job review.
        </p>
      </header>

      {/* Status tabs. Each link carries the active search, so switching tabs
          narrows rather than resets — the review queue's href builder drops
          unknown params by construction and would wipe ?q here. */}
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {JOB_POSTING_TABS.map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab}
              href={jobPostingsHref(tab, 1, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {JOB_POSTING_TAB_LABEL[tab]}
            </Link>
          );
        })}
      </nav>

      <JobPostingSearchBar />

      {/* ONE always-mounted live region carrying the result summary.
          The search bar commits with router.replace(..., { scroll: false }), so
          results swap in place: focus never moves, the pathname and <title> are
          unchanged, and Next's route announcer (which diffs the title) therefore
          says nothing. Without this, narrowing to 0 rows is announced by nothing
          at all and a screen-reader user keeps believing the old results are on
          screen. It must be ONE element that always renders and only changes its
          TEXT — a role="status" that mounts together with its message does not
          announce. Hence the summary is computed above and only the styling
          switches. Same construction as the candidate list. */}
      <p
        role="status"
        className={
          isEmpty
            ? 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]'
            : 'text-sm text-[var(--color-fg-muted)]'
        }
      >
        {summary}
      </p>

      {!isEmpty && (
        <>
          {/* The table scrolls inside its own card rather than the document —
              the app shell locks the viewport (h-screen + overflow-hidden) and
              scrolls each pane independently. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Job
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Posted by
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Applications
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  // The current list state travels with each row so the detail
                  // page's Back link can return to this exact filtered page
                  // rather than an unfiltered page 1.
                  <JobPostingRow
                    key={row.id}
                    row={row}
                    status={status}
                    page={result.page}
                    q={q}
                    deleteKilled={deleteKilled}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            status={status}
            page={result.page}
            total={result.total}
            pageSize={result.pageSize}
            q={q}
          />
        </>
      )}
    </div>
  );
}

function JobPostingRow({
  row,
  status,
  page,
  q,
  deleteKilled,
}: {
  row: JobPostingListRow;
  status: JobPostingTab;
  page: number;
  q: string | undefined;
  deleteKilled: boolean;
}) {
  const blockedReason = jobPostingDeleteBlockedReason(row);

  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        {/* Recruiter-authored free text shown to staff: plain text, never
            markup — the same rule the job review screen applies. */}
        <span className="block font-medium text-[var(--color-fg)]">{row.title}</span>
        {row.primaryCity && (
          <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
            {row.primaryCity.name}
          </span>
        )}
      </td>

      {/* Company is a nullable relation on this row shape. */}
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{row.company?.name ?? '—'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {/* postedById is nullable — SetNull when a recruiter departs — so a job
            can genuinely have no poster. */}
        {row.postedBy?.name?.trim() || row.postedBy?.email || 'No longer at the company'}
      </td>

      <td className="px-4 py-3">
        <StatusPill status={row.status} />
      </td>

      {/* Right-aligned because it is a quantity, and it is the number that
          decides whether Delete is available — worth being able to scan. */}
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {row.applicationCount.toLocaleString('en-IN')}
      </td>

      {/* createdAt, matching the sort. Showing postedAt here would render an em
          dash for every draft while the rows above it sort by something else. */}
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatDateIst(row.createdAt)}</td>

      <td className="px-4 py-3">
        <span className="flex items-center gap-3">
          {/* Self-describing out of context: twenty links all named "View" is
              what a screen-reader user hears when listing this page's controls.
              The visible word stays FIRST so voice control still matches
              "click View" (WCAG 2.5.3 Label in Name). */}
          <Link
            href={jobPostingDetailHref(row.id, status, page, q)}
            className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            View
            <span className="sr-only"> details for {row.title}</span>
          </Link>
          <DeleteJobPostingButton
            jobId={row.id}
            title={row.title}
            blockedReason={blockedReason}
            killed={deleteKilled}
          />
        </span>
      </td>
    </tr>
  );
}

// A neutral pill, not a colour-coded one. Only ACTIVE gets a tone: five colours
// across a dense table is noise, and this console's palette rule is monochrome
// plus one accent (CLAUDE.md §2). DRAFT / EXPIRED / CLOSED are ordinary states
// rather than problems, so painting them amber or red would invent an alarm.
function StatusPill({ status }: { status: JobPostingListRow['status'] }) {
  const live = status === 'ACTIVE';
  return (
    <span
      className={`inline-block rounded-md px-2 py-1 text-xs ${
        live
          ? 'bg-[var(--color-bg-muted)] font-medium text-[var(--color-success)]'
          : 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]'
      }`}
    >
      {formatJobPostingStatus(status)}
    </span>
  );
}

function Pagination({
  status,
  page,
  total,
  pageSize,
  q,
}: {
  status: JobPostingTab;
  page: number;
  total: number;
  pageSize: number;
  q: string | undefined;
}) {
  const lastPage = lastPageFor(total, pageSize);
  if (lastPage === 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--color-fg-muted)]">
        Page {page} of {lastPage}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={jobPostingsHref(status, page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={jobPostingsHref(status, page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
