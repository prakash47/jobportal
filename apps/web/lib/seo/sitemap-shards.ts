import { prisma } from '@jobportal/db';
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://jobportal.com';

// SRS §4.15 — 40k jobs per shard. Google's hard ceiling is 50k entries
// (or 50MB uncompressed) per sitemap file; 40k gives 20% headroom in
// case a future addition (alternate-language hreflang, image entries)
// inflates per-row size.
export const JOBS_PER_SHARD = 40_000;

// Special shard IDs for the four non-job content groups. Job shards
// start at SHARD_JOBS_BASE and go up by 1 per shard. Keeping these as
// named constants instead of magic numbers in sitemap.ts means a future
// content type can claim a fresh ID without renumbering the existing
// ones.
export const SHARD_STATIC = 0;
export const SHARD_COMPANIES = 1;
export const SHARD_ARTICLES = 2;
export const SHARD_LANDINGS = 3;
export const SHARD_JOBS_BASE = 4;

type Url = MetadataRoute.Sitemap[number];

// Static URLs that don't come from the DB. lastModified omitted on
// purpose — these pages change with deploys, not with content; a
// fixed-date here would lie. Googlebot will re-crawl on its own
// schedule.
export function getStaticUrls(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${SITE}/jobs`, changeFrequency: 'hourly' as const, priority: 0.9 },
    { url: `${SITE}/companies`, changeFrequency: 'weekly' as const, priority: 0.7 },
    { url: `${SITE}/career-advice`, changeFrequency: 'weekly' as const, priority: 0.6 },
  ];
}

// All companies. Editorial directory — include every row regardless of
// active job count (companies that don't currently have openings still
// have reviews / culture pages worth indexing).
export async function getCompanyUrls(): Promise<MetadataRoute.Sitemap> {
  const rows = await prisma.company.findMany({
    select: { id: true, slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  const out: Url[] = [];
  for (const c of rows) {
    out.push({
      url: `${SITE}/${c.slug}-overview-${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
    // SRS §4.7.6 — life-at-company CMS page lives at
    // /working-at-<slug>-<id> as a sibling of the overview.
    out.push({
      url: `${SITE}/working-at-${c.slug}-${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }
  return out;
}

// PUBLISHED articles only. DRAFT and ARCHIVED stay out of the sitemap;
// the page-level guard also notFound()s them at render time so a
// crawler hitting a leaked URL gets a 404 (not a soft-404).
export async function getArticleUrls(): Promise<MetadataRoute.Sitemap> {
  const rows = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((a) => ({
    url: `${SITE}/career-advice/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));
}

// SEO landing pages: /[skill]-jobs-in-[city]. Quality > coverage:
// emit only combinations that resolve to at least one ACTIVE job
// today, otherwise we'd advertise thin-content pages to Google and
// risk a manual action. The 4 SRP variants are:
//   /jobs-in-<city>
//   /<skill>-jobs
//   /<skill>-jobs-in-<city>
//   /jobs (covered by getStaticUrls)
//
// The combo expansion is the only one that needs filtering — pure
// skill and pure city pages are useful even if their inventory dips
// temporarily.
export async function getLandingUrls(): Promise<MetadataRoute.Sitemap> {
  const [cities, skills] = await Promise.all([
    prisma.city.findMany({ select: { slug: true }, orderBy: { id: 'asc' } }),
    prisma.skill.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } }),
  ]);

  const out: Url[] = [];

  // /jobs-in-<city> for every seeded city. Cheap, ~50 rows.
  for (const c of cities) {
    out.push({
      url: `${SITE}/jobs-in-${c.slug}`,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  }

  // /<skill>-jobs for every skill that has at least one ACTIVE job
  // anywhere. Skips zero-inventory skill landings.
  const skillsWithJobs = await prisma.job.groupBy({
    by: ['skillIds'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });
  const activeSkillIds = new Set<number>();
  for (const group of skillsWithJobs) {
    for (const id of group.skillIds) activeSkillIds.add(id);
  }
  for (const s of skills) {
    if (!activeSkillIds.has(s.id)) continue;
    out.push({
      url: `${SITE}/${s.slug}-jobs`,
      changeFrequency: 'daily',
      priority: 0.65,
    });
  }

  // /<skill>-jobs-in-<city> Cartesian. Filter to combos with ≥1 ACTIVE
  // job to avoid thin-content pages. With 100 skills × 50 cities = 5000
  // combos this is a manageable scan; if it grows past ~50k the math
  // here needs revisiting (likely move to a precomputed materialized
  // view).
  //
  // We materialise the matrix in one query rather than 5000 individual
  // counts: get every (cityId, skillId) pair that has at least one
  // ACTIVE job. The Prisma Postgres adapter unnest()s skillIds for us
  // via the array contains operator — but groupBy on a primitive array
  // is awkward, so we use a raw query.
  const activePairs = await prisma.$queryRaw<
    Array<{ cityId: number; skillId: number }>
  >`
    SELECT DISTINCT
      "primaryCityId" AS "cityId",
      UNNEST("skillIds") AS "skillId"
    FROM "Job"
    WHERE status = 'ACTIVE'
      AND "primaryCityId" IS NOT NULL
  `;

  const cityById = new Map<number, string>();
  for (const c of await prisma.city.findMany({ select: { id: true, slug: true } })) {
    cityById.set(c.id, c.slug);
  }
  const skillSlugById = new Map<number, string>();
  for (const s of skills) skillSlugById.set(s.id, s.slug);

  for (const { cityId, skillId } of activePairs) {
    const citySlug = cityById.get(cityId);
    const skillSlug = skillSlugById.get(skillId);
    if (!citySlug || !skillSlug) continue;
    out.push({
      url: `${SITE}/${skillSlug}-jobs-in-${citySlug}`,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  return out;
}

// Number of ACTIVE jobs determines how many job shards we need.
// generateSitemaps() calls this to declare the shard count up front.
export async function getJobShardCount(): Promise<number> {
  const total = await prisma.job.count({ where: { status: 'ACTIVE' } });
  if (total === 0) return 0;
  return Math.ceil(total / JOBS_PER_SHARD);
}

// One shard's worth of ACTIVE jobs. shardIndex is 0-based (the caller
// translates from the absolute Next sitemap ID by subtracting
// SHARD_JOBS_BASE).
export async function getJobShard(shardIndex: number): Promise<MetadataRoute.Sitemap> {
  const rows = await prisma.job.findMany({
    where: { status: 'ACTIVE' },
    select: { canonicalSlug: true, updatedAt: true },
    orderBy: { id: 'asc' },
    skip: shardIndex * JOBS_PER_SHARD,
    take: JOBS_PER_SHARD,
  });
  return rows.map((j) => ({
    url: `${SITE}/job/${j.canonicalSlug}`,
    lastModified: j.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));
}
