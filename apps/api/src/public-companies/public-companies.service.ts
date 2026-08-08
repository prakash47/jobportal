import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@jobportal/db';
import { parseCompanySlug, buildCompanySlug } from '@jobportal/domain/slug';
import {
  parseHighlightSections,
  type HighlightSection,
} from '@jobportal/domain/company-highlights';
import type { DirectoryParams } from '@jobportal/domain/company-params';

/**
 * 20, matching every other API list endpoint (owner decision, ADR 0002 §4).
 *
 * The WEBSITE directory uses 24 to fill its 2-column grid — a deliberate,
 * recorded divergence rather than an oversight. It means page N of the two
 * surfaces holds different companies, which is fine because they are different
 * products, but it must not be "fixed" by silently copying 24 here.
 */
export const PAGE_SIZE = 20;

export interface CompanyListItem {
  id: number;
  name: string;
  slug: string;
  handle: string;
  logoUrl: string | null;
  industryName: string | null;
  hqCityName: string | null;
  averageRating: number | null;
  reviewCount: number;
  openRolesCount: number;
}

export interface CompanyDetail {
  id: number;
  name: string;
  slug: string;
  handle: string;
  logoUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  companyType: string | null;
  industryName: string | null;
  hqCityName: string | null;
  employeeCount: string | null;
  foundedYear: number | null;
  averageRating: number | null;
  reviewCount: number;
  activeJobs: number;
  isVerified: boolean;
  highlights: HighlightSection[];
  openings: {
    id: number;
    title: string;
    canonicalSlug: string;
    primaryCityName: string | null;
    postedAt: string;
  }[];
  reviews: {
    id: number;
    rating: number;
    title: string | null;
    body: string;
    isVerified: boolean;
    createdAt: string;
    authorName: string | null;
  }[];
  relatedCompanies: {
    id: number;
    slug: string;
    name: string;
    handle: string;
    logoUrl: string | null;
    averageRating: number | null;
    openRoles: number;
  }[];
}

/** Thrown when the handle's slug half has drifted from the canonical one. */
export class CompanySlugRedirect extends Error {
  constructor(public readonly handle: string) {
    super('canonical handle redirect');
  }
}

@Injectable()
export class PublicCompaniesService {
  /**
   * Company directory.
   *
   * NO company-level visibility gate, and that is not an omission: there is no
   * status, published or soft-delete column on Company — every row is public,
   * and the website renders them all. Only JOB-derived numbers are filtered to
   * ACTIVE.
   */
  async list(params: DirectoryParams): Promise<{
    hits: CompanyListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // An unknown or malformed category slug yields NO filter rather than a
    // 404 — the shared parser already drops a malformed one, and the SSR
    // treats an unresolvable industry the same way. Diverging here would make
    // a URL that works on the website 404 on the app.
    const industry = params.category
      ? await prisma.industry.findUnique({
          where: { slug: params.category },
          select: { id: true },
        })
      : null;

    const where: Prisma.CompanyWhereInput = {};
    if (industry) where.industryId = industry.id;
    if (params.hiring) where.jobs = { some: { status: 'ACTIVE' } };

    // Every branch ends with a unique `id` tiebreaker, copied from the SSR:
    // `name` is not unique, and offset pagination over a non-unique sort key
    // can duplicate or drop the row on a page seam.
    const orderBy: Prisma.CompanyOrderByWithRelationInput[] =
      params.sort === 'name'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : params.sort === 'reviews'
          ? [{ reviewCount: 'desc' }, { name: 'asc' }, { id: 'asc' }]
          : [{ averageRating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          averageRating: true,
          reviewCount: true,
          industry: { select: { name: true } },
          headquartersCity: { select: { name: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);

    // ONE grouped query for the visible page, never one per card.
    const openByCompany = await this.openRoleCounts(rows.map((r) => r.id));

    return {
      hits: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        handle: buildCompanySlug({ name: r.name, id: r.id }),
        logoUrl: r.logoUrl,
        industryName: r.industry?.name ?? null,
        hqCityName: r.headquartersCity?.name ?? null,
        averageRating: r.averageRating,
        reviewCount: r.reviewCount,
        openRolesCount: openByCompany.get(r.id) ?? 0,
      })),
      total,
      page: params.page,
      pageSize: PAGE_SIZE,
    };
  }

  async detail(handle: string): Promise<CompanyDetail> {
    const parsed = parseCompanySlug(handle);
    if (!parsed) throw new NotFoundException('Company not found');

    const company = await prisma.company.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        websiteUrl: true,
        companyType: true,
        workingAtSections: true,
        averageRating: true,
        reviewCount: true,
        employeeCount: true,
        foundedYear: true,
        industryId: true,
        industry: { select: { name: true } },
        headquartersCity: { select: { name: true } },
        kyc: { select: { status: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    const canonical = buildCompanySlug({ name: company.name, id: company.id });
    // No visibility gate to run first (unlike jobs), but the redirect still
    // comes after the existence check so an unknown id cannot be probed via a
    // Location header.
    if (company.slug !== parsed.slug) throw new CompanySlugRedirect(canonical);

    const [activeJobs, openings, reviews, relatedCompanies] = await Promise.all([
      prisma.job.count({ where: { companyId: company.id, status: 'ACTIVE' } }),
      prisma.job.findMany({
        where: { companyId: company.id, status: 'ACTIVE' },
        orderBy: { postedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          canonicalSlug: true,
          postedAt: true,
          primaryCity: { select: { name: true } },
        },
      }),
      prisma.companyReview.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          isVerified: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      this.relatedCompanies(company.id, company.industryId),
    ]);

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      handle: canonical,
      logoUrl: company.logoUrl,
      description: company.description,
      websiteUrl: company.websiteUrl,
      companyType: company.companyType,
      industryName: company.industry?.name ?? null,
      hqCityName: company.headquartersCity?.name ?? null,
      employeeCount: company.employeeCount,
      foundedYear: company.foundedYear,
      averageRating: company.averageRating,
      reviewCount: company.reviewCount,
      activeJobs,
      // The ABSENCE of a KYC row IS the "not submitted" state — most companies
      // have none — so anything other than VERIFIED is false.
      isVerified: company.kyc?.status === 'VERIFIED',
      highlights: parseHighlightSections(company.workingAtSections),
      openings: openings.map((j) => ({
        id: j.id,
        title: j.title,
        canonicalSlug: j.canonicalSlug,
        primaryCityName: j.primaryCity?.name ?? null,
        postedAt: j.postedAt.toISOString(),
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerified: r.isVerified,
        createdAt: r.createdAt.toISOString(),
        // Null when the reviewer has no name; the client renders "Anonymous".
        // The website already shows this publicly, so the API matches it
        // rather than inventing a stricter rule for one surface.
        authorName: r.user?.name ?? null,
      })),
      relatedCompanies,
    };
  }

  /** Same-industry peers, most-reviewed first, with their live-role counts. */
  private async relatedCompanies(companyId: number, industryId: number | null) {
    if (industryId === null) return [];
    const peers = await prisma.company.findMany({
      where: { industryId, id: { not: companyId } },
      orderBy: [{ reviewCount: 'desc' }, { averageRating: 'desc' }, { id: 'asc' }],
      take: 5,
      select: { id: true, slug: true, name: true, logoUrl: true, averageRating: true },
    });
    if (peers.length === 0) return [];

    const openByCompany = await this.openRoleCounts(peers.map((p) => p.id));
    return peers.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      handle: buildCompanySlug({ name: p.name, id: p.id }),
      logoUrl: p.logoUrl,
      averageRating: p.averageRating,
      openRoles: openByCompany.get(p.id) ?? 0,
    }));
  }

  /** ACTIVE-job counts for a bounded set of company ids, in one query. */
  private async openRoleCounts(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.job.groupBy({
      by: ['companyId'],
      where: { companyId: { in: ids }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.companyId, r._count._all]));
  }
}
