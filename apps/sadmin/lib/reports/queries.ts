// Content-report queue reads.
//
// Reads/writes split (the repo's topology): the queue and its detail screen are
// display-only, so every row comes straight from Postgres via Prisma inside the
// RSC — the same call lib/job-postings/queries.ts and lib/subscriptions/queries.ts
// make and for the same reason.
//
// ⚠ Reads ONLY. Claim / Uphold / Dismiss go through apps/api
// (PATCH /admin/reports/:id) so AdminGuard, the killswitch, the compare-and-swap
// on the report's status and BOTH audit rows all apply — and so a takedown
// actually de-indexes the posting from Elasticsearch and purges its cached page.
// A prisma.contentReport.update() here — or a server action wrapping one — would
// bypass every one of those, and this file is exactly the convenient place to do
// it.
//
// ⚠ reporterIp is never selected. It is stored for abuse triage on an
// unauthenticated endpoint and no surface may render it (schema.prisma
// ContentReport.reporterIp); cutting it at the SELECT rather than hiding it in
// markup is the same treatment GSTIN and PAN get on the employer console.

import {
  prisma,
  type ContentReportReason,
  type ContentReportStatus,
  type JobStatus,
  type Prisma,
} from '@jobportal/db';
import { REPORTS_PAGE_SIZE, escapeLikePattern, isOpenReport, type ReportTab } from './format';

/** The posting a report names. Nullable: ContentReport.jobId is. */
export interface ReportedJob {
  id: number;
  title: string;
  status: JobStatus;
  canonicalSlug: string;
  company: { id: number; name: string } | null;
}

export interface ReportListRow {
  id: number;
  status: ContentReportStatus;
  reason: ContentReportReason;
  createdAt: Date;
  job: ReportedJob | null;
  /** Null for an anonymous report — the common case, not an error state. */
  reporter: { name: string; email: string } | null;
  /** Open reports against the same posting, EXCLUDING this one. */
  otherOpenReports: number;
}

export interface ReportListPage {
  rows: ReportListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportDetail extends ReportListRow {
  /**
   * The reporter's own words. UNTRUSTED user content shown to staff for the
   * express purpose of judging it: render as plain text, never as markup, and
   * never copy it into an audit diff, a log line or an email.
   */
  details: string | null;
  reviewedAt: Date | null;
  resolutionNote: string | null;
  /** Null when never decided, or when the deciding admin's account is gone. */
  reviewedBy: { name: string; email: string } | null;
}

/**
 * Build the shared where-clause once.
 *
 * Exported so it can be unit-tested directly — the same thing
 * lib/subscriptions/queries.ts does with subscriptionWhere. Handed BY REFERENCE
 * to both count() and findMany(): a divergence between the two would make the
 * total, the summary sentence, the pagination link count and the over-range
 * redirect all disagree with the visible rows.
 */
export function reportWhere(status: ReportTab, q?: string): Prisma.ContentReportWhereInput {
  return {
    // 'ALL' is a pseudo-status: it means "no status predicate at all", so the
    // key is omitted rather than set to undefined.
    ...(status === 'ALL' ? {} : { status }),
    ...(q
      ? {
          // Searching the posting rather than the report, because a report has
          // no words of its own worth searching: `details` is optional free text
          // most reporters leave blank, and the reason is a tab-level facet, not
          // a search term. "Show me everything reported against Acme" is the
          // question staff actually ask.
          //
          // Escaped: Prisma's `contains` does not escape LIKE wildcards, so an
          // unescaped '%' would match every report instead of the literal
          // character the admin typed.
          job: {
            is: {
              OR: [
                { title: { contains: escapeLikePattern(q), mode: 'insensitive' as const } },
                {
                  company: {
                    is: { name: { contains: escapeLikePattern(q), mode: 'insensitive' as const } },
                  },
                },
              ],
            },
          },
        }
      : {}),
  };
}

const JOB_SELECT = {
  id: true,
  title: true,
  status: true,
  canonicalSlug: true,
  company: { select: { id: true, name: true } },
} as const;

/**
 * Hydrate the loose User ids a batch of rows refers to.
 *
 * `ContentReport.reporterId` and `reviewedById` are plain Int columns with NO
 * foreign key (the CompanyKyc.reviewedById pattern), deliberately so that
 * deleting an account cannot erase the reports it filed or the decisions it
 * made. The price is that Prisma cannot `include` them — so they are resolved
 * with one extra query and tolerate a missing row, exactly as
 * AdminJobsService.listJobs does for Job.reviewedById.
 */
async function hydrateUsers(ids: number[]): Promise<Map<number, { name: string; email: string }>> {
  const unique = [...new Set(ids)];
  // Skip the round-trip entirely when nothing references a user — an all-anonymous
  // page of reports is the normal case, not an edge case.
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

/**
 * Count OPEN + REVIEWING reports per posting, for the visible page only.
 *
 * The schema added `@@index([jobId, status])` specifically for this: a posting
 * reported forty times must read as one problem, not forty. One groupBy over the
 * page's job ids rather than N counts.
 */
async function openReportCountsByJob(jobIds: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(jobIds)];
  if (unique.length === 0) return new Map();
  const grouped = await prisma.contentReport.groupBy({
    by: ['jobId'],
    where: { jobId: { in: unique }, status: { in: ['OPEN', 'REVIEWING'] } },
    _count: { _all: true },
  });
  return new Map(
    grouped
      .filter((g): g is typeof g & { jobId: number } => g.jobId != null)
      .map((g) => [g.jobId, g._count._all]),
  );
}

/** Subtract the row itself, so the number means "reports OTHER than this one". */
function othersFor(
  row: { jobId: number | null; status: ContentReportStatus },
  counts: Map<number, number>,
): number {
  if (row.jobId == null) return 0;
  const total = counts.get(row.jobId) ?? 0;
  return Math.max(0, total - (isOpenReport(row.status) ? 1 : 0));
}

/**
 * The report queue — newest first, optionally narrowed to one status and/or a
 * posting/company search.
 */
export async function listReports(
  page: number,
  status: ReportTab,
  q?: string,
): Promise<ReportListPage> {
  const where = reportWhere(status, q);

  const [reports, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      // Newest first: this is a work queue, and a report that has just arrived is
      // the one nobody has looked at. `id` breaks ties deterministically —
      // offset pagination is only sound on a total order, and two reports filed
      // in the same millisecond (or seeded in one batch) would otherwise be
      // ordered differently between the page-1 and page-2 queries, dropping one
      // row and duplicating another across the seam.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        jobId: true,
        reporterId: true,
        job: { select: JOB_SELECT },
      },
    }),
    prisma.contentReport.count({ where }),
  ]);

  const [reporters, openCounts] = await Promise.all([
    hydrateUsers(reports.map((r) => r.reporterId).filter((id): id is number => id != null)),
    openReportCountsByJob(reports.map((r) => r.jobId).filter((id): id is number => id != null)),
  ]);

  return {
    rows: reports.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      job: r.job,
      reporter: r.reporterId == null ? null : (reporters.get(r.reporterId) ?? null),
      otherOpenReports: othersFor(r, openCounts),
    })),
    total,
    page,
    pageSize: REPORTS_PAGE_SIZE,
  };
}

/** One report, with everything the decision screen needs. Null when unknown. */
export async function getReportDetail(id: number): Promise<ReportDetail | null> {
  const report = await prisma.contentReport.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      reason: true,
      details: true,
      createdAt: true,
      jobId: true,
      reporterId: true,
      reviewedAt: true,
      reviewedById: true,
      resolutionNote: true,
      job: { select: JOB_SELECT },
    },
  });
  if (!report) return null;

  const ids = [report.reporterId, report.reviewedById].filter((v): v is number => v != null);
  const [users, openCounts] = await Promise.all([
    hydrateUsers(ids),
    openReportCountsByJob(report.jobId == null ? [] : [report.jobId]),
  ]);

  return {
    id: report.id,
    status: report.status,
    reason: report.reason,
    details: report.details,
    createdAt: report.createdAt,
    job: report.job,
    reporter: report.reporterId == null ? null : (users.get(report.reporterId) ?? null),
    reviewedAt: report.reviewedAt,
    resolutionNote: report.resolutionNote,
    reviewedBy: report.reviewedById == null ? null : (users.get(report.reviewedById) ?? null),
    otherOpenReports: othersFor(report, openCounts),
  };
}
