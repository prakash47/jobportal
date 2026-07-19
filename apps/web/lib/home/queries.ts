// Homepage SSR data fetch — one Promise.all to keep TTFB low (CLAUDE.md §8
// targets API p95 < 300ms; this aggregates 7 queries into a single round).
// The page is public + cacheable; the consuming route sets `revalidate = 1800`.
//
// Two non-obvious bits:
//   1. Top skills uses raw SQL with UNNEST. We learned in PR #31 that Prisma's
//      `groupBy({ by: ['skillIds'] })` groups by the whole array value, not
//      per element — useless for popularity. Raw UNNEST does the right thing.
//   2. Top cities groups by `primaryCityId` (Job has `cityIds: Int[]` too,
//      but the primary is what the SRP filter expects and is what middleware
//      canonicalises against). Same shape as the existing
//      /jobs-in-{city} route's filter.

import { prisma, Prisma } from '@jobportal/db';

export interface PopularItem {
  slug: string;
  name: string;
  jobCount: number;
}

export interface IndustryItem {
  slug: string;
  name: string;
  jobCount: number;
}

export interface RoleItem {
  label: string;
  query: string; // SRP ?q= value
  jobCount: number;
}

// Curated role taxonomy. Job titles are freeform, so instead of a Role table
// (Phase 2) we bucket active jobs by title keyword. Each role links to the SRP
// full-text search (?q=). Roles with a zero count are dropped before render so
// the grid never shows an empty bucket — works against the 50-job demo seed
// and scales to production unchanged.
const ROLE_DEFS: ReadonlyArray<{ label: string; query: string; patterns: string[] }> = [
  { label: 'Full Stack Developer', query: 'full stack', patterns: ['%full stack%', '%fullstack%'] },
  { label: 'Backend Engineer', query: 'backend', patterns: ['%backend%', '%back end%', '%back-end%'] },
  { label: 'Frontend Engineer', query: 'frontend', patterns: ['%frontend%', '%front end%', '%front-end%'] },
  { label: 'Data Engineer', query: 'data engineer', patterns: ['%data engineer%'] },
  { label: 'Data Scientist', query: 'data scientist', patterns: ['%data scien%', '%machine learning%', '%ml engineer%'] },
  { label: 'DevOps Engineer', query: 'devops', patterns: ['%devops%', '%site relia%', '%platform engineer%'] },
  { label: 'Mobile Developer', query: 'mobile', patterns: ['%android%', '%ios%', '%mobile%', '%react native%'] },
  { label: 'Product Manager', query: 'product manager', patterns: ['%product manager%', '%product management%'] },
  { label: 'Designer', query: 'designer', patterns: ['%design%', '%ux%', '%ui %'] },
  { label: 'QA Engineer', query: 'qa', patterns: ['%qa %', '%quality%', '% test%', '%sdet%'] },
  { label: 'Engineering Manager', query: 'engineering manager', patterns: ['%engineering manager%', '%staff engineer%', '%principal engineer%'] },
  { label: 'Sales', query: 'sales', patterns: ['%sales%', '%business development%', '%account manager%'] },
];

export interface FeaturedCompany {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  industryName: string | null;
  hqCityName: string | null;
  averageRating: number | null;
  reviewCount: number;
  openingsCount: number;
}

export interface RecentArticle {
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

// Real ACTIVE jobs for the "Latest jobs" section (server-rendered proof of
// inventory). Salary stays in paise; the card formats to LPA.
export interface FeaturedJob {
  canonicalSlug: string;
  title: string;
  companyId: number;
  companyName: string;
  companyLogoUrl: string | null;
  cityName: string | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  workMode: string;
  postedAt: Date;
}

export interface HomePageData {
  counts: { activeJobs: number; companies: number; recruiters: number };
  topIndustries: IndustryItem[];
  topRoles: RoleItem[];
  popularCities: PopularItem[];
  popularSkills: PopularItem[];
  featuredCompanies: FeaturedCompany[];
  recentArticles: RecentArticle[];
  latestJobs: FeaturedJob[];
}

// Pure transform: takes `{ id, jobCount }` pairs (in priority order) and a
// hydration set, emits the consumer-shaped popular item list. Drops any pair
// whose id no longer hydrates (e.g. a city soft-deleted between cache regens).
// Extracted so it's unit-testable without mocking Prisma.
export function hydratePopularItems(
  groups: ReadonlyArray<{ id: number; jobCount: number }>,
  hydrated: ReadonlyArray<{ id: number; slug: string; name: string }>,
): PopularItem[] {
  const byId = new Map(hydrated.map((h) => [h.id, h]));
  const out: PopularItem[] = [];
  for (const g of groups) {
    const h = byId.get(g.id);
    if (h) out.push({ slug: h.slug, name: h.name, jobCount: g.jobCount });
  }
  return out;
}

// Builds the UNION-ALL role-count query from ROLE_DEFS. One round trip, one
// row per role: `{ idx, jobCount }`. idx maps back to ROLE_DEFS so labels and
// query strings stay in TS, not SQL.
function roleCountsQuery(): Prisma.Sql {
  const parts = ROLE_DEFS.map((role, idx) => {
    const likeClauses = Prisma.join(
      role.patterns.map((p) => Prisma.sql`"title" ILIKE ${p}`),
      ' OR ',
    );
    return Prisma.sql`SELECT ${idx}::int AS "idx", COUNT(*)::bigint AS "jobCount" FROM "Job" WHERE "status" = 'ACTIVE' AND (${likeClauses})`;
  });
  return Prisma.join(parts, ' UNION ALL ');
}

export async function loadHomePageData(): Promise<HomePageData> {
  const [
    activeJobs,
    companies,
    recruiters,
    industryGroups,
    roleRows,
    cityGroups,
    skillRows,
    featured,
    recentArticles,
    heroJobsRaw,
  ] = await Promise.all([
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.company.count(),
      prisma.user.count({ where: { role: 'RECRUITER' } }),

      prisma.job.groupBy({
        by: ['industryId'],
        where: { status: 'ACTIVE', industryId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { industryId: 'desc' } },
        take: 12,
      }),

      prisma.$queryRaw<Array<{ idx: number; jobCount: bigint }>>(roleCountsQuery()),

      prisma.job.groupBy({
        by: ['primaryCityId'],
        where: { status: 'ACTIVE', primaryCityId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { primaryCityId: 'desc' } },
        take: 12,
      }),

      prisma.$queryRaw<Array<{ skillId: number; jobCount: bigint }>>`
        SELECT UNNEST("skillIds") AS "skillId", COUNT(*)::bigint AS "jobCount"
        FROM "Job"
        WHERE "status" = 'ACTIVE'
        GROUP BY 1
        ORDER BY "jobCount" DESC
        LIMIT 12
      `,

      prisma.company.findMany({
        orderBy: [{ averageRating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
        take: 8,
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

      prisma.article.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          authorName: true,
          publishedAt: true,
          readTimeMinutes: true,
          tags: true,
          coverImageUrl: true,
        },
      }),

      // Latest jobs — newest 8 ACTIVE jobs. Uses @@index([status, postedAt]).
      prisma.job.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { postedAt: 'desc' },
        take: 8,
        select: {
          canonicalSlug: true,
          title: true,
          salaryMinPaise: true,
          salaryMaxPaise: true,
          workMode: true,
          postedAt: true,
          company: { select: { id: true, name: true, logoUrl: true } },
          primaryCity: { select: { name: true } },
        },
      }),
    ]);

  // groupBy on a nullable col types primaryCityId as `number | null`. We
  // already filtered nulls in `where`, but the type doesn't know that.
  const cityPairs = cityGroups
    .filter((g): g is typeof g & { primaryCityId: number } => g.primaryCityId !== null)
    .map((g) => ({ id: g.primaryCityId, jobCount: g._count._all }));

  const skillPairs = skillRows.map((r) => ({ id: r.skillId, jobCount: Number(r.jobCount) }));

  const industryPairs = industryGroups
    .filter((g): g is typeof g & { industryId: number } => g.industryId !== null)
    .map((g) => ({ id: g.industryId, jobCount: g._count._all }));

  // Roles: map idx → ROLE_DEFS, drop zero-count buckets, keep desc order.
  const topRoles: RoleItem[] = roleRows
    .map((r) => ({ def: ROLE_DEFS[r.idx], jobCount: Number(r.jobCount) }))
    .filter((r): r is { def: (typeof ROLE_DEFS)[number]; jobCount: number } =>
      r.def !== undefined && r.jobCount > 0,
    )
    .sort((a, b) => b.jobCount - a.jobCount)
    .slice(0, 10)
    .map((r) => ({ label: r.def.label, query: r.def.query, jobCount: r.jobCount }));

  // Featured companies need an openings count; one extra groupBy keyed on
  // the 8 ids keeps this O(1) round-trips.
  const featuredIds = featured.map((c) => c.id);

  const [cities, skills, industries, openings] = await Promise.all([
    cityPairs.length
      ? prisma.city.findMany({
          where: { id: { in: cityPairs.map((p) => p.id) } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: number; slug: string; name: string }>),
    skillPairs.length
      ? prisma.skill.findMany({
          where: { id: { in: skillPairs.map((p) => p.id) } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: number; slug: string; name: string }>),
    industryPairs.length
      ? prisma.industry.findMany({
          where: { id: { in: industryPairs.map((p) => p.id) } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: number; slug: string; name: string }>),
    featuredIds.length
      ? prisma.job.groupBy({
          by: ['companyId'],
          where: { companyId: { in: featuredIds }, status: 'ACTIVE' },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{ companyId: number; _count: { _all: number } }>,
        ),
  ]);

  const openByCompany = new Map<number, number>();
  for (const o of openings) openByCompany.set(o.companyId, o._count._all);

  const featuredCompanies: FeaturedCompany[] = featured.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    logoUrl: c.logoUrl,
    industryName: c.industry?.name ?? null,
    hqCityName: c.headquartersCity?.name ?? null,
    averageRating: c.averageRating,
    reviewCount: c.reviewCount,
    openingsCount: openByCompany.get(c.id) ?? 0,
  }));

  const latestJobs: FeaturedJob[] = heroJobsRaw.map((j) => ({
    canonicalSlug: j.canonicalSlug,
    title: j.title,
    companyId: j.company.id,
    companyName: j.company.name,
    companyLogoUrl: j.company.logoUrl,
    cityName: j.primaryCity?.name ?? null,
    salaryMinPaise: j.salaryMinPaise,
    salaryMaxPaise: j.salaryMaxPaise,
    workMode: j.workMode,
    postedAt: j.postedAt,
  }));

  return {
    counts: { activeJobs, companies, recruiters },
    topIndustries: hydratePopularItems(industryPairs, industries).map((i) => ({
      slug: i.slug,
      name: i.name,
      jobCount: i.jobCount,
    })),
    topRoles,
    popularCities: hydratePopularItems(cityPairs, cities),
    popularSkills: hydratePopularItems(skillPairs, skills),
    featuredCompanies,
    recentArticles,
    latestJobs,
  };
}
