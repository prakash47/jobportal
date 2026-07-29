// Employer Management reads.
//
// Reads/writes split (the repo's topology): this console is display-only, so
// every row comes straight from Postgres via Prisma inside the RSC — no BFF hop
// and no new API endpoint, the same call lib/dashboard/queries.ts makes and for
// the same reason. The job review queue goes through apps/api instead because
// its list and detail must agree with a *mutation* endpoint; nothing here
// mutates. Anything that ever WRITES from this surface (suspending an employer,
// say) must move to apps/api so AdminGuard, Zod validation and audit logging all
// apply.
//
// An "employer" is a Company. Several recruiters share one, so the person shown
// beside a company is derived — see ./format resolveContact.

import { prisma, type JobStatus } from '@jobportal/db';
import { EMPLOYERS_PAGE_SIZE, verificationOf, type EmployerTeamMember } from './format';
import type { KycStatus } from '@jobportal/db';

// Ordered oldest-first so a company's team reads as the order people joined, and
// so resolveContact's join-date tiebreak sees a stable sequence. `id` breaks
// exact-timestamp ties. Nothing in the schema prevents two Recruiter rows
// sharing a createdAt to the millisecond — bulk provisioning or an invite
// accepted in the same tick would do it — and without the tiebreak the contact
// shown for such a company could differ between two renders of the same data.
// (This is defensive, not observed: measured on the dev database, all 10
// recruiters currently have distinct createdAt values.)
const TEAM_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

const TEAM_FIELDS = {
  id: true,
  companyId: true,
  companyRole: true,
  deactivatedAt: true,
  createdAt: true,
  contactPhone: true,
  designation: true,
  // Recruiter.user is a required relation, so this is never null.
  user: { select: { name: true, email: true } },
} as const;

export interface EmployerListRow {
  id: number;
  name: string;
  slug: string;
  /**
   * Company.createdAt — when the EMPLOYER registered. Deliberately not the
   * owner's Recruiter.createdAt: self-registration into an existing company is
   * rejected by the API ("ask an admin on that team to invite you"), so every
   * recruiter after the first joined an already-registered employer and their
   * date would mean "this person joined", a different fact.
   */
  registeredAt: Date;
  kycStatus: KycStatus;
  team: EmployerTeamMember[];
}

export interface EmployerListPage {
  rows: EmployerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The employer master list, newest registration first.
 *
 * The team is fetched as a SECOND bounded query rather than a nested include so
 * the contact can be resolved in TypeScript against every member. A nested
 * `take: 1` would have to encode the precedence in an `orderBy`, and the only
 * available one — `companyRole: 'asc'` — happens to yield OWNER first purely
 * because of the enum's declaration order. See ROLE_PRECEDENCE in ./format.
 */
export async function listEmployers(page: number): Promise<EmployerListPage> {
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      // `id` breaks ties deterministically. Offset pagination is only sound if
      // the sort is a total order: two companies sharing a createdAt could
      // otherwise be ordered differently between the page-1 and page-2 queries,
      // which drops one row and duplicates another across the seam. createdAt
      // alone is not unique (nothing in the schema makes it so), `id` is.
      // (Defensive, not observed: measured on the dev database, all 14 companies
      // currently have distinct createdAt values.)
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * EMPLOYERS_PAGE_SIZE,
      take: EMPLOYERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        // Nullable relation: 13 of 14 companies on a seeded database have no KYC
        // row at all, and its absence IS the NOT_SUBMITTED state.
        kyc: { select: { status: true } },
      },
    }),
    prisma.company.count(),
  ]);

  const teams = await loadTeams(companies.map((c) => c.id));

  return {
    rows: companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      registeredAt: c.createdAt,
      kycStatus: verificationOf(c.kyc),
      team: teams.get(c.id) ?? [],
    })),
    total,
    page,
    pageSize: EMPLOYERS_PAGE_SIZE,
  };
}

/**
 * Every recruiter for the companies on this page, grouped by company. Bounded by
 * one page of companies times a team size that is single-digit in practice, so
 * it stays one round trip rather than N.
 */
async function loadTeams(companyIds: number[]): Promise<Map<number, EmployerTeamMember[]>> {
  if (companyIds.length === 0) return new Map();

  const rows = await prisma.recruiter.findMany({
    where: { companyId: { in: companyIds } },
    orderBy: TEAM_ORDER,
    select: TEAM_FIELDS,
  });

  const byCompany = new Map<number, EmployerTeamMember[]>();
  for (const r of rows) {
    const list = byCompany.get(r.companyId);
    const member: EmployerTeamMember = {
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      contactPhone: r.contactPhone,
      designation: r.designation,
      companyRole: r.companyRole,
      deactivatedAt: r.deactivatedAt,
      joinedAt: r.createdAt,
    };
    if (list) list.push(member);
    else byCompany.set(r.companyId, [member]);
  }
  return byCompany;
}

/**
 * Job counts per lifecycle state.
 *
 * Every bucket is named explicitly rather than derived from a total, because the
 * obvious `_count: { jobs: true }` is a bug this repo has already shipped once:
 * `Job.postedAt` is NOT NULL DEFAULT now(), so DRAFT rows carry one and get
 * counted as posted (measured 53 reported vs 52 actually live on this database).
 */
export interface EmployerJobCounts {
  live: number;
  awaitingReview: number;
  draft: number;
  expired: number;
  closed: number;
  /** Every row, including drafts that never reached a candidate. */
  total: number;
}

export interface EmployerActivity {
  jobs: EmployerJobCounts;
  /** Applications across every job this company has ever posted. */
  applications: number;
  supportTickets: number;
  /** Invites neither accepted, revoked, nor past their expiry. */
  pendingInvites: number;
}

export interface EmployerDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  companyType: string | null;
  employeeCount: string | null;
  foundedYear: number | null;
  averageRating: number | null;
  reviewCount: number;
  registeredAt: Date;
  industry: string | null;
  headquartersCity: string | null;
  kycStatus: KycStatus;
  kyc: {
    legalName: string | null;
    authorizedPersonName: string | null;
    authorizedPersonDesignation: string | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    rejectionReason: string | null;
  } | null;
  team: EmployerTeamMember[];
  activity: EmployerActivity;
}

/**
 * One employer's full profile. `now` is passed in so the pending-invite window
 * is evaluated against the same instant the page renders with, rather than each
 * query inventing its own.
 *
 * Returns null for an unknown id; the caller turns that into a 404.
 */
export async function getEmployerDetail(id: number, now: Date): Promise<EmployerDetail | null> {
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      websiteUrl: true,
      companyType: true,
      employeeCount: true,
      foundedYear: true,
      averageRating: true,
      reviewCount: true,
      createdAt: true,
      industry: { select: { name: true } },
      headquartersCity: { select: { name: true } },
      kyc: {
        select: {
          status: true,
          legalName: true,
          authorizedPersonName: true,
          authorizedPersonDesignation: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
          // GSTIN / PAN / registration number are deliberately NOT selected.
          // They are PII under the DPDP Act and admin-kyc masks them even in its
          // own list; this console has no reason to hold them, and the KYC
          // review screen remains the one place they are handled.
        },
      },
    },
  });
  if (!company) return null;

  const [team, jobGroups, applications, supportTickets, pendingInvites] = await Promise.all([
    prisma.recruiter.findMany({
      where: { companyId: id },
      orderBy: TEAM_ORDER,
      select: TEAM_FIELDS,
    }),
    // One grouped query gives every lifecycle bucket, so no count can silently
    // fold DRAFT into a "posted" figure.
    prisma.job.groupBy({
      by: ['status'],
      where: { companyId: id },
      _count: { _all: true },
    }),
    prisma.application.count({ where: { job: { companyId: id } } }),
    prisma.supportTicket.count({ where: { companyId: id } }),
    // "Pending" is DERIVED from the timestamps — the schema stores no invite
    // status column, and an invite past expiresAt is dead even though nothing
    // marked it so.
    prisma.recruiterInvite.count({
      where: { companyId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    }),
  ]);

  // Keyed by the Prisma enum, so adding a JobStatus is a compile error here
  // rather than a bucket that silently vanishes from the total.
  const byStatus: Record<JobStatus, number> = {
    DRAFT: 0,
    PENDING_MODERATION: 0,
    ACTIVE: 0,
    EXPIRED: 0,
    CLOSED: 0,
  };
  for (const g of jobGroups) byStatus[g.status] = g._count._all;

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    description: company.description,
    logoUrl: company.logoUrl,
    websiteUrl: company.websiteUrl,
    companyType: company.companyType,
    employeeCount: company.employeeCount,
    foundedYear: company.foundedYear,
    averageRating: company.averageRating,
    reviewCount: company.reviewCount,
    registeredAt: company.createdAt,
    industry: company.industry?.name ?? null,
    headquartersCity: company.headquartersCity?.name ?? null,
    kycStatus: verificationOf(company.kyc),
    kyc: company.kyc
      ? {
          legalName: company.kyc.legalName,
          authorizedPersonName: company.kyc.authorizedPersonName,
          authorizedPersonDesignation: company.kyc.authorizedPersonDesignation,
          submittedAt: company.kyc.submittedAt,
          reviewedAt: company.kyc.reviewedAt,
          rejectionReason: company.kyc.rejectionReason,
        }
      : null,
    team: team.map((r) => ({
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      contactPhone: r.contactPhone,
      designation: r.designation,
      companyRole: r.companyRole,
      deactivatedAt: r.deactivatedAt,
      joinedAt: r.createdAt,
    })),
    activity: {
      jobs: {
        live: byStatus.ACTIVE,
        awaitingReview: byStatus.PENDING_MODERATION,
        draft: byStatus.DRAFT,
        expired: byStatus.EXPIRED,
        closed: byStatus.CLOSED,
        total:
          byStatus.ACTIVE +
          byStatus.PENDING_MODERATION +
          byStatus.DRAFT +
          byStatus.EXPIRED +
          byStatus.CLOSED,
      },
      applications,
      supportTickets,
      pendingInvites,
    },
  };
}
