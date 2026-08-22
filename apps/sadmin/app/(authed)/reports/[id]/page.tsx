import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';
import { BackLink, Card } from '../../../../components/jobs/JobDetailView';
import { formatDateTimeIst } from '../../../../lib/jobs/format';
import {
  clampPage,
  firstParam,
  formatJobPostingStatus,
  formatOtherOpenReports,
  formatReportReason,
  formatReportStatus,
  formatReporter,
  isOpenReport,
  normalizeQuery,
  parseReportTab,
  reportsHref,
  takedownBlockedReason,
} from '../../../../lib/reports/format';
import { getReportDetail } from '../../../../lib/reports/queries';
import { ReportDecisionForm } from '../../../../components/reports/ReportDecisionForm';

export const metadata: Metadata = {
  title: 'Report — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function ReportDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. The layout does
  // call requireSuperAdmin(), but this file could be moved out from under it and
  // silently lose the check — and this route renders a reporter's identity and
  // their free-text accusation about a named employer.
  await requireAdminScope('moderation', 'READ_ONLY');

  const { id } = await params;
  const sp = await searchParams;

  // Strict coercion, because this id reaches Prisma directly. A digits-only test
  // rejects the hex and exponent forms Number() would accept, and the int4
  // ceiling matters: a larger value makes Prisma THROW rather than return no
  // rows, which escapes as a 500 where 404 is correct. Same guard as
  // /job-postings/[id] and /subscriptions/[id].
  const reportId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(reportId) || reportId < 1) notFound();
  if (reportId > 2_147_483_647) notFound();

  const backHref = reportsHref(
    parseReportTab(sp.status),
    clampPage(firstParam(sp.page)),
    normalizeQuery(firstParam(sp.q)),
  );

  const [report, writesKilled] = await Promise.all([
    getReportDetail(reportId),
    // Layer 2 of the flag gate: render the actions the API would refuse anyway
    // as inert. Deliberately does NOT gate the route — 404ing the only surface
    // that can show what was reported, because deciding is switched off, would
    // take the read down with the write. Layer 3 in AdminReportsService.update
    // is the enforcement point.
    isFlagEnabled('killswitch.admin_report_write'),
  ]);

  if (!report) notFound();

  const decided = !isOpenReport(report.status);
  const others = formatOtherOpenReports(report.otherOpenReports);

  return (
    <div className="space-y-6">
      <BackLink href={backHref} label="Back to content reports" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {formatReportReason(report.reason)}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Report #{report.id} · {formatReportStatus(report.status)} · filed{' '}
          {formatDateTimeIst(report.createdAt)}
        </p>
      </header>

      {others && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]"
        >
          {others}
        </p>
      )}

      <Card title="What was reported">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[var(--color-fg-muted)]">Reason given</dt>
            <dd className="mt-0.5 text-[var(--color-fg)]">{formatReportReason(report.reason)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-fg-muted)]">Reported by</dt>
            <dd className="mt-0.5 text-[var(--color-fg)]">
              {formatReporter(report.reporter)}
              {/* Gated on the NAME, not on the reporter: formatReporter already
                  falls back to the email when the name is blank, so an
                  unconditional append renders "p@x.com · p@x.com". Blank names
                  are real here — lib/reports/format.test.ts pins that fallback
                  because the candidate console shipped the whitespace-name bug
                  and had to fix it. */}
              {report.reporter && report.reporter.name.trim() !== '' && (
                <span className="text-[var(--color-fg-muted)]"> · {report.reporter.email}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-fg-muted)]">In their words</dt>
            {/* ⚠ UNTRUSTED reporter-authored free text, shown to staff for the
                express purpose of judging it. Rendered as PLAIN TEXT — never
                dangerouslySetInnerHTML, never a Markdown renderer — and
                `whitespace-pre-wrap` so the reporter's own line breaks survive
                without any markup being interpreted. It must also never be
                copied into an audit diff, a log line or an email
                (schema.prisma ContentReport.details). */}
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-[var(--color-fg)]">
              {report.details?.trim() ? (
                report.details
              ) : (
                <span className="text-[var(--color-fg-muted)]">
                  No further detail was given. The reason above is the whole report.
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="The posting">
        {report.job ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--color-fg-muted)]">Title</dt>
              {/* Recruiter-authored free text: plain text, never markup. */}
              <dd className="mt-0.5 text-[var(--color-fg)]">{report.job.title}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-fg-muted)]">Company</dt>
              <dd className="mt-0.5 text-[var(--color-fg)]">{report.job.company?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-fg-muted)]">Current status</dt>
              {/* Through the shared label map, never the raw enum. The takedown
                  hint two cards below says "this posting is not live" in
                  English, and the queue row this page was opened from says
                  "Under review" — printing PENDING_MODERATION here would make
                  three surfaces describe one job three different ways. */}
              <dd className="mt-0.5 text-[var(--color-fg)]">
                {formatJobPostingStatus(report.job.status)}
              </dd>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <Link
                href={`/job-postings/${report.job.id}`}
                className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                Open in Job Postings
              </Link>
              {/* Absolute, cross-app link to the live seeker page — the only way
                  to judge a report is to look at what the reporter looked at. */}
              <a
                href={`${WEB_URL}/job/${report.job.canonicalSlug}`}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                View the public page
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </dl>
        ) : (
          // ContentReport.job is onDelete: Cascade, so a report normally vanishes
          // with its posting — this state is only reachable for a report whose
          // jobId was null, which no current code path produces. Stated rather
          // than rendered as an empty card.
          <p className="text-sm text-[var(--color-fg-muted)]">
            This report does not name a posting.
          </p>
        )}
      </Card>

      {decided ? (
        <Card title="Decision">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--color-fg-muted)]">Outcome</dt>
              <dd className="mt-0.5 text-[var(--color-fg)]">
                {formatReportStatus(report.status)}
                {report.reviewedAt && ` · ${formatDateTimeIst(report.reviewedAt)}`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-fg-muted)]">Decided by</dt>
              {/* reviewedById is a loose Int with no FK so a deleted admin does
                  not erase the decision — hence the null tolerance. */}
              <dd className="mt-0.5 text-[var(--color-fg)]">
                {report.reviewedBy
                  ? (report.reviewedBy.name.trim() || report.reviewedBy.email)
                  : 'Account no longer exists'}
              </dd>
            </div>
            {report.resolutionNote && (
              <div>
                <dt className="text-[var(--color-fg-muted)]">Note</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[var(--color-fg)]">
                  {report.resolutionNote}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      ) : (
        <ReportDecisionForm
          reportId={report.id}
          canClaim={report.status === 'OPEN'}
          jobTitle={report.job?.title ?? null}
          takedownBlockedReason={takedownBlockedReason(report.job)}
          killed={writesKilled}
        />
      )}
    </div>
  );
}
