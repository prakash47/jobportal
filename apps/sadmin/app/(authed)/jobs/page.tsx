import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { adminApiGet } from '../../../lib/admin-api';
import { formatDateIst, formatWaiting, waitingDays } from '../../../lib/jobs/format';
import type { JobReviewList } from '../../../lib/jobs/types';

export const metadata: Metadata = {
  title: 'Job review — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads the cookie via adminApiGet, so this can never be statically rendered.
export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'decided', label: 'Recently decided' },
] as const;

interface PageProps {
  searchParams: Promise<{ view?: string; page?: string }>;
}

export default async function JobReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = sp.view === 'decided' ? 'decided' : 'pending';
  // Clamp before it reaches the API: page feeds Prisma's `skip`, which is an
  // i64, and the DTO would 400 on junk anyway — but a clamp here means a
  // hand-typed ?page=99999999999 renders an empty page instead of an error.
  const page = clampPage(sp.page);

  const [result, moderationEnabled] = await Promise.all([
    adminApiGet<JobReviewList>(`/admin/jobs?view=${view}&page=${page}`),
    isFlagEnabled('moderation.jobs.enabled'),
  ]);

  // An over-range page must not render the empty state: `total` is non-zero, so
  // "No jobs are waiting for review" would be a lie, and the count, table and
  // pagination all live in the non-empty branch — leaving an admin on a dead end
  // with no control to get back. Redirect to the real last page instead, the
  // same fix the recruiter Jobs list already applies. Guarded on page > 1 so a
  // genuinely empty view still reaches its empty state rather than looping.
  if (result.ok && page > 1 && result.data.hits.length === 0 && result.data.total > 0) {
    const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));
    if (page > lastPage) redirect(pageHref(view, lastPage));
  }

  // One shared anchor for every "waiting N days" on the page, so two rows
  // rendered either side of a millisecond boundary cannot disagree.
  const now = new Date();

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Job review</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Approve a posting to publish it, or send it back to the recruiter with a reason.
        </p>
      </header>

      {/* Without this, an empty queue reads as "all caught up" when the truth is
          that nothing can enter it. Same reasoning as the dashboard card. */}
      {!moderationEnabled && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]"
        >
          Job moderation is currently <strong className="font-medium">off</strong>, so new postings
          go live without review and nothing new will arrive here. Jobs already awaiting a decision
          can still be actioned.
        </p>
      )}

      <nav aria-label="Review views" className="flex gap-1 border-b border-[var(--color-border)]">
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={v.key === 'pending' ? '/jobs' : `/jobs?view=${v.key}`}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      {!result.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-danger)]"
        >
          {result.message}
        </p>
      ) : result.data.hits.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          {view === 'pending'
            ? 'No jobs are waiting for review.'
            : 'No jobs have been reviewed yet.'}
        </p>
      ) : (
        // Note: an over-range ?page is redirected to the last real page above,
        // so reaching the empty branch genuinely means the view is empty.
        <>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.data.total.toLocaleString('en-IN')}{' '}
            {result.data.total === 1 ? 'job' : 'jobs'}
            {view === 'pending' ? ' awaiting review' : ' reviewed'}
          </p>

          {/* The table scrolls inside its own card rather than the document —
              the (authed) layout clips document-level horizontal overflow for
              data-wide pages. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[760px] text-left text-sm">
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
                    {view === 'pending' ? 'Waiting' : 'Decision'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.data.hits.map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--color-bg-muted)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-medium text-[var(--color-fg)] hover:underline"
                      >
                        {job.title}
                      </Link>
                      {job.primaryCity && (
                        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                          {job.primaryCity.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                      {job.company?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                      {/* postedById is nullable — SetNull when a recruiter
                          departs — so a job can genuinely have no poster. */}
                      {job.postedBy?.name ?? job.postedBy?.email ?? 'No longer at the company'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                      {view === 'pending' ? (
                        formatWaiting(waitingDays(job.submittedForReviewAt, now))
                      ) : (
                        <DecisionCell job={job} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            view={view}
            page={result.data.page}
            total={result.data.total}
            pageSize={result.data.pageSize}
          />
        </>
      )}
    </div>
  );
}

// A decided job is ACTIVE if it was approved and DRAFT if it was sent back — the
// two outcomes moderate() produces. Reading the outcome off `status` rather than
// storing a separate verdict keeps one source of truth, and rejectionReason
// disambiguates a job that has since moved on.
function DecisionCell({ job }: { job: JobReviewList['hits'][number] }) {
  const approved = job.rejectionReason == null;
  return (
    <span className="block">
      <span
        className={
          approved ? 'font-medium text-[var(--color-success)]' : 'font-medium text-[var(--color-fg)]'
        }
      >
        {approved ? 'Approved' : 'Sent back'}
      </span>
      <span className="mt-0.5 block text-xs">{formatDateIst(job.reviewedAt)}</span>
    </span>
  );
}

function Pagination({
  view,
  page,
  total,
  pageSize,
}: {
  view: string;
  page: number;
  total: number;
  pageSize: number;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage === 1) return null;
  const href = (p: number): string => pageHref(view, p);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--color-fg-muted)]">
        Page {page} of {lastPage}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={href(page + 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}

// Shared by the pagination links and the over-range redirect, so the two can
// never build different URLs for the same page. Omits defaults (view=pending,
// page=1) to keep the canonical URL clean. basePath-relative: Next adds
// '/sadmin' itself.
function pageHref(view: string, p: number): string {
  const params = new URLSearchParams();
  if (view === 'decided') params.set('view', view);
  if (p > 1) params.set('page', String(p));
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}

function clampPage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 1_000_000);
}
