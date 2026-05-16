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
      url: `${SITE}/company/${c.slug}-overview-${c.id}`,
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
//
// Note: skill-only landings (/<skill>-jobs) include skills that appear
// on ANY ACTIVE job, including those with a null primaryCityId. The
// combo expansion below requires both halves and thus excludes jobs
// with no primary city. This asymmetry is intentional — a skill page
// is useful even for fully-remote roles; a "skill in city" page isn't.
export async function getLandingUrls(): Promise<MetadataRoute.Sitemap> {
  const [cities, skills] = await Promise.all([
    prisma.city.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } }),
    prisma.skill.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } }),
  ]);

  const cityById = new Map<number, string>();
  for (const c of cities) cityById.set(c.id, c.slug);
  const skillSlugById = new Map<number, string>();
  for (const s of skills) skillSlugById.set(s.id, s.slug);

  const out: Url[] = [];

  // /jobs-in-<city> for every seeded city. Cheap, ~50 rows.
  for (const c of cities) {
    out.push({
      url: `${SITE}/jobs-in-${c.slug}`,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  }

  // /<skill>-jobs for skills with ≥1 ACTIVE job. UNNEST returns each
  // skill-id once via SELECT DISTINCT — far cheaper than groupBy on the
  // whole array (which Postgres groups by the entire array value, not
  // per-element, producing O(distinct shapes) groups we'd have to
  // flatten anyway).
  const activeSkillRows = await prisma.$queryRaw<Array<{ skillId: number }>>`
    SELECT DISTINCT UNNEST("skillIds") AS "skillId"
    FROM "Job"
    WHERE status = 'ACTIVE'
  `;
  const activeSkillIds = new Set(activeSkillRows.map((r) => Number(r.skillId)));

  for (const s of skills) {
    if (!activeSkillIds.has(s.id)) continue;
    out.push({
      url: `${SITE}/${s.slug}-jobs`,
      changeFrequency: 'daily',
      priority: 0.65,
    });
  }

  // /<skill>-jobs-in-<city> Cartesian DEFERRED — the multi-token
  // dynamic segment `[skill]-jobs-in-[city]` triggers a Next 16
  // Invariant ("Could not resolve param value for segment"). Tracked in
  // PROGRESS.md follow-ups; the route + this sitemap entry will be
  // restored once the SEO landings are refactored into a catch-all or
  // sub-path structure that Next 16 can resolve.
  // const activePairs = await prisma.$queryRaw<...>...;

  return out;
}

// Number of job shards needed based on MAX(Job.id), not COUNT(*). Each
// shard owns a fixed id range — shard 0 covers ids 1..40000, shard 1
// covers 40001..80000, etc. — so a job that exists in shard N at one
// regeneration is still in shard N at the next regeneration regardless
// of status flips between ACTIVE and CLOSED.
//
// Trade-off: shards near the start of the id space gradually thin out
// as old jobs close. Acceptable; sitemap shards don't need to be
// balanced, and the ordered crawl behavior actually helps freshness
// (the last shard is always the newest jobs).
//
// Edge case: jobs ARE almost never deleted (we use CLOSED status, not
// DELETE), so max-id is monotonic. If a future deletion path lands,
// max-id can shrink and previously-declared shards may disappear from
// the index — Google handles that gracefully (it 404s the old URL and
// drops it on the next crawl).
export async function getJobShardCount(): Promise<number> {
  const result = await prisma.job.aggregate({
    where: { status: 'ACTIVE' },
    _max: { id: true },
  });
  const maxId = result._max.id;
  if (maxId === null || maxId === undefined) return 0;
  return Math.ceil(maxId / JOBS_PER_SHARD);
}

// One shard's worth of ACTIVE jobs by id range. shardIndex is 0-based
// (the caller translates from the absolute Next sitemap ID by
// subtracting SHARD_JOBS_BASE). Range is half-open: shard N covers
// (N * JOBS_PER_SHARD, (N+1) * JOBS_PER_SHARD] in 1-indexed terms,
// i.e. ids in (lo, hi] using strict-gt / lte. Shard 0 starts at id=1.
export async function getJobShard(shardIndex: number): Promise<MetadataRoute.Sitemap> {
  const lo = shardIndex * JOBS_PER_SHARD;
  const hi = (shardIndex + 1) * JOBS_PER_SHARD;
  const rows = await prisma.job.findMany({
    where: {
      status: 'ACTIVE',
      id: { gt: lo, lte: hi },
    },
    select: { canonicalSlug: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((j) => ({
    url: `${SITE}/job/${j.canonicalSlug}`,
    lastModified: j.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));
}
