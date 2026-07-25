// Dashboard reads. Reads/writes split: the dashboard is display-only, so every
// number here comes straight from Postgres via Prisma in the RSC — no BFF hop,
// no new endpoint.
//
// Two waves, deliberately separated because they have very different costs and
// the page streams them independently (see dashboard/page.tsx):
//
//   Wave 1 — getDashboardRecruiter(): ONE query. Feeds the verification card,
//            which the owner requires above everything else, so it must not
//            wait on anything slower.
//   Wave 2 — getCompanyKpis():        SIX queries in a single Promise.all,
//            behind a <Suspense> boundary.
//
// Scope is COMPANY-wide (`Job.companyId`), matching the Jobs list. `postedById`
// is nullable (`onDelete: SetNull`), so scoping by poster silently drops jobs
// whose author has left the company — the totals would quietly under-report.
// "Posted by you" is surfaced separately as its own stat.

import { cache } from 'react';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../auth/server-session';
import type { KycBadgeStatus } from '../../components/kyc/KycStatusBadge';
import type { JobStatus } from '../../components/jobs/JobStatusBadge';
import { filled, type CompanyProfileFields, type KycFields } from './verification';

export type ApplicationStatus =
  | 'APPLIED'
  | 'IN_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEWED'
  | 'OFFERED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

const JOB_STATUSES: readonly JobStatus[] = [
  'ACTIVE',
  'DRAFT',
  'PENDING_MODERATION',
  'EXPIRED',
  'CLOSED',
];

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'APPLIED',
  'IN_REVIEW',
  'SHORTLISTED',
  'INTERVIEWED',
  'OFFERED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
];

/** Jobs whose expiry falls inside this window are surfaced as needing attention. */
export const EXPIRING_SOON_DAYS = 14;

/** How many rows the "Top performing jobs" panel lists. */
const TOP_JOBS_LIMIT = 5;

export interface DashboardRecruiter {
  userId: number;
  companyId: number;
  companyName: string;
  workEmailVerified: boolean;
  email: string;
  company: CompanyProfileFields;
  kyc: KycFields | null;
}

/**
 * The signed-in recruiter, their company's profile columns, and their company's
 * KYC state — everything the verification card needs, in one round-trip.
 *
 * Wrapped in React `cache()` so it is computed at most ONCE per request even
 * though the page and (potentially) other server components ask for it. This
 * mirrors apps/web's getHeaderUser. Per-request memoisation only — nothing is
 * cached across requests, so a recruiter never sees another recruiter's data
 * and never sees a stale verification state.
 *
 * Returns null for a just-registered recruiter whose row is not ready yet; the
 * page renders the same "profile not found" panel /kyc and /profile use.
 */
export const getDashboardRecruiter = cache(async (): Promise<DashboardRecruiter | null> => {
  const session = await readUserFromCookie();
  if (!session) return null;

  const row = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: {
      companyId: true,
      workEmailVerified: true,
      user: { select: { email: true } },
      company: {
        select: {
          name: true,
          // The eight columns /profile edits — the company-profile axis.
          description: true,
          logoUrl: true,
          websiteUrl: true,
          companyType: true,
          industryId: true,
          headquartersCityId: true,
          employeeCount: true,
          foundedYear: true,
          // KYC. gstNumber is read ONLY to evaluate the "has a GST number"
          // predicate — the value is never returned to the client or rendered.
          // panNumber is not read at all (the API treats it as optional).
          kyc: {
            select: {
              status: true,
              legalName: true,
              gstNumber: true,
              authorizedPersonName: true,
              rejectionReason: true,
              documents: { where: { deletedAt: null }, select: { docType: true } },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    userId: session.sub,
    companyId: row.companyId,
    companyName: row.company.name,
    workEmailVerified: row.workEmailVerified,
    email: row.user.email,
    company: {
      description: row.company.description,
      logoUrl: row.company.logoUrl,
      websiteUrl: row.company.websiteUrl,
      companyType: row.company.companyType,
      industryId: row.company.industryId,
      headquartersCityId: row.company.headquartersCityId,
      employeeCount: row.company.employeeCount,
      foundedYear: row.company.foundedYear,
    },
    // The three identifiers collapse to booleans HERE, at the boundary, so the
    // raw GSTIN / legal name / authorized-person name never enter the returned
    // object and cannot reach a render tree or an RSC payload by accident. The
    // card only ever asks "was this provided?".
    kyc: row.company.kyc
      ? {
          status: row.company.kyc.status as KycBadgeStatus,
          hasLegalName: filled(row.company.kyc.legalName),
          hasGstNumber: filled(row.company.kyc.gstNumber),
          hasAuthorizedPersonName: filled(row.company.kyc.authorizedPersonName),
          docTypes: row.company.kyc.documents.map((d) => d.docType),
          rejectionReason: row.company.kyc.rejectionReason,
        }
      : null,
  };
});

export interface TopJob {
  id: number;
  title: string;
  status: JobStatus;
  applications: number;
  /**
   * Whether the viewer posted this job. The list is company-wide, but
   * /jobs/[id] is scoped to the poster plus any collaborators and 404s for
   * everyone else. Rather than spend another round-trip resolving collaborator
   * rows, only the viewer's own jobs are linked: a collaborator therefore sees
   * their row as plain text — under-linked, never a dead click. This is the
   * same conservative line the Jobs list draws on teammate rows.
   */
  isOwn: boolean;
}

export interface DashboardKpis {
  jobsByStatus: Record<JobStatus, number>;
  totalJobs: number;
  appsByStatus: Record<ApplicationStatus, number>;
  totalApplications: number;
  /** Applications still live in the funnel (excludes REJECTED + WITHDRAWN). */
  inPipeline: number;
  /** Jobs this recruiter personally posted, within the company total. */
  postedByYou: number;
  /** ACTIVE jobs expiring within EXPIRING_SOON_DAYS. */
  expiringSoon: number;
  /** ACTIVE jobs that have received nothing yet. */
  activeWithNoApplicants: number;
  topJobs: TopJob[];
}

/** groupBy omits empty buckets entirely, so every key is seeded to 0 first. */
function foldCounts<K extends string>(
  keys: readonly K[],
  rows: ReadonlyArray<{ status: string; _count: { _all: number } }>,
): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const row of rows) {
    if ((keys as readonly string[]).includes(row.status)) {
      out[row.status as K] = row._count._all;
    }
  }
  return out;
}

/**
 * Every KPI on the dashboard, in six parallel queries.
 *
 * The two groupBy calls collapse what would otherwise be thirteen separate
 * counts (five job statuses + eight application statuses) into two round-trips.
 * There is deliberately NO per-job fan-out here: the Jobs list computes a
 * skill-match column by issuing one nested count per row, which is fine for one
 * page of results but would be an N+1 on a dashboard, so no skill-match metric
 * is offered.
 */
export async function getCompanyKpis(companyId: number, userId: number): Promise<DashboardKpis> {
  const now = new Date();
  const expiryHorizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000);

  const [jobRows, appRows, topJobRows, activeWithNoApplicants, expiringSoon, postedByYou] =
    await Promise.all([
      // All five job-status counts.
      prisma.job.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      // All eight application-status counts, including HIRED.
      prisma.application.groupBy({
        by: ['status'],
        where: { job: { companyId } },
        _count: { _all: true },
      }),
      // Top jobs by application volume. Ordered in the database (no fan-out);
      // postedAt + id tiebreakers keep the order deterministic across renders.
      prisma.job.findMany({
        where: { companyId },
        orderBy: [{ applications: { _count: 'desc' } }, { postedAt: 'desc' }, { id: 'desc' }],
        take: TOP_JOBS_LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          postedById: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.job.count({
        where: { companyId, status: 'ACTIVE', applications: { none: {} } },
      }),
      prisma.job.count({
        where: { companyId, status: 'ACTIVE', expiresAt: { gte: now, lte: expiryHorizon } },
      }),
      prisma.job.count({ where: { companyId, postedById: userId } }),
    ]);

  const jobsByStatus = foldCounts(JOB_STATUSES, jobRows);
  const appsByStatus = foldCounts(APPLICATION_STATUSES, appRows);

  const totalJobs = Object.values(jobsByStatus).reduce((a, b) => a + b, 0);
  const totalApplications = Object.values(appsByStatus).reduce((a, b) => a + b, 0);
  const inPipeline = totalApplications - appsByStatus.REJECTED - appsByStatus.WITHDRAWN;

  return {
    jobsByStatus,
    totalJobs,
    appsByStatus,
    totalApplications,
    inPipeline,
    postedByYou,
    expiringSoon,
    activeWithNoApplicants,
    topJobs: topJobRows.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status as JobStatus,
      applications: j._count.applications,
      isOwn: j.postedById === userId,
    })),
  };
}
