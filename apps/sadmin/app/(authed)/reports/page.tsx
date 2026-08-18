import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  REPORT_TABS,
  REPORT_TAB_LABEL,
  clampPage,
  firstParam,
  formatReportReason,
  formatReportStatus,
  formatReporter,
  formatReportsSummary,
  isOpenReport,
  lastPageFor,
  normalizeQuery,
  parseReportTab,
  reportDetailHref,
  reportsHref,
  type ReportTab,
} from '../../../lib/reports/format';
import { listReports, type ReportListRow } from '../../../lib/reports/queries';
import { ReportSearchBar } from '../../../components/reports/ReportSearchBar';

export const metadata: Metadata = {
  title: 'Content reports — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it, not as we wish it were: a REPEATED key
// (`?q=a&q=b`) arrives as an ARRAY, so all three params go through firstParam /
// parseReportTab. Typing these as bare strings is what let an array reach
// `raw.trim()` and 500 the sibling /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = parseReportTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  // No feature-flag read here, deliberately. This surface renders no write
  // control at all — deciding a report happens on the detail page, where the
  // killswitch is read and passed to ReportDecisionForm. Reading the queue is
  // never gated: staff must be able to see what users have reported precisely
  // while writes are switched off.
  const result = await listReports(page, status, q);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No open reports" would be a lie, and the count, table and pagination all
  // live in the non-empty branch — leaving an admin on a dead end with no
  // control to get back. Redirect to the real last page instead, sharing its
  // href builder with the tabs and the pagination links so the three cannot
  // disagree. Guarded on page > 1 so a genuinely empty queue still reaches its
  // empty state rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404. This is why /candidates, /employers, /jobs,
  // /job-postings, /otp-sessions and /subscriptions all lack one.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(reportsHref(status, lastPage, q));
  }

  const isEmpty = result.rows.length === 0;
  const summary = formatReportsSummary(result.total, status, q);

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Content reports
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Job postings that users have flagged as fake, misleading or inappropriate. Open one to
          read what was reported and rule on it.
        </p>
      </header>

      {/* Status tabs. Each link carries the active search, so switching tabs
          narrows rather than resets. */}
      <nav
        aria-label="Filter by status"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
      >
        {REPORT_TABS.map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab}
              href={reportsHref(tab, 1, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {REPORT_TAB_LABEL[tab]}
            </Link>
          );
        })}
      </nav>

      <ReportSearchBar />

      {/* ONE always-mounted live region carrying the result summary. The search
          bar commits with router.replace(..., { scroll: false }), so results swap
          in place: focus never moves, the pathname and <title> are unchanged, and
          Next's route announcer (which diffs the title) therefore says nothing.
          It must be ONE element that always renders and only changes its TEXT — a
          role="status" that mounts together with its message does not announce. */}
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
                    Reported posting
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Reason
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Reported by
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Filed
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <ReportRow key={row.id} row={row} status={status} page={result.page} q={q} />
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

function ReportRow({
  row,
  status,
  page,
  q,
}: {
  row: ReportListRow;
  status: ReportTab;
  page: number;
  q: string | undefined;
}) {
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        {/* Recruiter-authored free text shown to staff: plain text, never
            markup — the same rule the job review screen applies. */}
        <span className="block font-medium text-[var(--color-fg)]">
          {row.job?.title ?? 'Posting deleted'}
        </span>
        {/* A posting reported many times must read as ONE problem, not many.
            This is what @@index([jobId, status]) was added for, and it also
            absorbs the known duplicate-report race (the one-open-report-per-
            person rule is a check-then-insert with no partial unique index). */}
        {row.otherOpenReports > 0 && (
          <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
            +{row.otherOpenReports} other open{' '}
            {row.otherOpenReports === 1 ? 'report' : 'reports'}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{row.job?.company?.name ?? '—'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatReportReason(row.reason)}</td>

      {/* Anonymous is the COMMON case here, not missing data — the reported page
          is public and mostly logged-out — so it reads as a word, not an em dash. */}
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatReporter(row.reporter)}</td>

      <td className="px-4 py-3">
        <StatusPill status={row.status} />
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatDateIst(row.createdAt)}</td>

      <td className="px-4 py-3">
        {/* Self-describing out of context: twenty links all named "Review" is
            what a screen-reader user hears when listing this page's controls.
            The visible word stays FIRST so voice control still matches
            "click Review" (WCAG 2.5.3 Label in Name). */}
        <Link
          href={reportDetailHref(row.id, status, page, q)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Review
          <span className="sr-only"> report {row.id}</span>
        </Link>
      </td>
    </tr>
  );
}

// A neutral pill. This console's palette rule is monochrome plus one accent
// (CLAUDE.md §2), and painting OPEN amber or ACTIONED red would invent an alarm
// on a queue where every row is, by definition, already a complaint.
//
// The still-to-do states are distinguished by WEIGHT AND FOREGROUND, not hue —
// the same fix the job-postings pill took after --color-success on
// --color-bg-muted measured 2.76:1, below the 4.5:1 WCAG AA floor for 12px text.
// Weight-not-colour is also what CLAUDE.md §2 asks for, so the accessible fix
// and the design mandate agree.
function StatusPill({ status }: { status: ReportListRow['status'] }) {
  const needsWork = isOpenReport(status);
  return (
    <span
      className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${
        needsWork ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'
      }`}
    >
      {formatReportStatus(status)}
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
  status: ReportTab;
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
            href={reportsHref(status, page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={reportsHref(status, page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
