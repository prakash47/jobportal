import type { MetadataRoute } from 'next';
import {
  getArticleUrls,
  getCompanyUrls,
  getJobShard,
  getJobShardCount,
  getLandingUrls,
  getStaticUrls,
  SHARD_ARTICLES,
  SHARD_COMPANIES,
  SHARD_JOBS_BASE,
  SHARD_LANDINGS,
  SHARD_STATIC,
} from '../lib/seo/sitemap-shards';

// SRS §4.15 — sharded sitemap. Next 16 mounts the index at /sitemap.xml
// and each shard at /sitemap/<id>.xml. generateSitemaps() declares how
// many shards exist; the default export is called once per shard with
// { id }.
//
// Shard layout (see sitemap-shards.ts for the constants):
//   0: static URLs (homepage + /jobs + /companies + /career-advice)
//   1: company overview + working-at pages
//   2: PUBLISHED career-advice articles
//   3: SEO landing pages (skill / city / skill×city, filtered for non-thin content)
//   4+: ACTIVE job detail pages, 40k per shard

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const jobShards = await getJobShardCount();
  // Always include the 4 non-job shards. Even if zero companies /
  // articles / landings exist, the page renders an empty <urlset/>,
  // which is valid sitemap XML — better than serving 404s for the
  // shard URLs we advertise in the index.
  const ids: Array<{ id: number }> = [
    { id: SHARD_STATIC },
    { id: SHARD_COMPANIES },
    { id: SHARD_ARTICLES },
    { id: SHARD_LANDINGS },
  ];
  for (let i = 0; i < jobShards; i++) {
    ids.push({ id: SHARD_JOBS_BASE + i });
  }
  return ids;
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  switch (id) {
    case SHARD_STATIC:
      return getStaticUrls();
    case SHARD_COMPANIES:
      return getCompanyUrls();
    case SHARD_ARTICLES:
      return getArticleUrls();
    case SHARD_LANDINGS:
      return getLandingUrls();
    default: {
      const shardIndex = id - SHARD_JOBS_BASE;
      if (shardIndex < 0) return [];
      return getJobShard(shardIndex);
    }
  }
}
