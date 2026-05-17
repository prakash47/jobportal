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

import { prisma } from '@jobportal/db';

export interface PopularItem {
  slug: string;
  name: string;
  jobCount: number;
}

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

export interface HomePageData {
  counts: { activeJobs: number; companies: number; recruiters: number };
  popularCities: PopularItem[];
  popularSkills: PopularItem[];
  featuredCompanies: FeaturedCompany[];
  recentArticles: RecentArticle[];
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

export async function loadHomePageData(): Promise<HomePageData> {
  const [activeJobs, companies, recruiters, cityGroups, skillRows, featured, recentArticles] =
    await Promise.all([
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.company.count(),
      prisma.user.count({ where: { role: 'RECRUITER' } }),

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
    ]);

  // groupBy on a nullable col types primaryCityId as `number | null`. We
  // already filtered nulls in `where`, but the type doesn't know that.
  const cityPairs = cityGroups
    .filter((g): g is typeof g & { primaryCityId: number } => g.primaryCityId !== null)
    .map((g) => ({ id: g.primaryCityId, jobCount: g._count._all }));

  const skillPairs = skillRows.map((r) => ({ id: r.skillId, jobCount: Number(r.jobCount) }));

  // Featured companies need an openings count; one extra groupBy keyed on
  // the 8 ids keeps this O(1) round-trips.
  const featuredIds = featured.map((c) => c.id);

  const [cities, skills, openings] = await Promise.all([
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

  return {
    counts: { activeJobs, companies, recruiters },
    popularCities: hydratePopularItems(cityPairs, cities),
    popularSkills: hydratePopularItems(skillPairs, skills),
    featuredCompanies,
    recentArticles,
  };
}
