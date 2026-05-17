// Sitemap index at /sitemap.xml.
//
// Old approach (deleted): apps/web/app/sitemap.ts as a Next metadata file
// with generateSitemaps(). That only mounted /sitemap/<id>.xml URLs and
// did NOT auto-emit a sitemap-index. robots.txt advertises /sitemap.xml,
// so the missing index meant every well-behaved crawler 404'd. (Chip #5
// part 1.) Next 16 also reserves /sitemap.xml for the metadata file even
// when generateSitemaps is set, blocking the natural route-handler shape.
//
// New approach: split into two route handlers and drop the metadata file.
//   /sitemap.xml         → this file: enumerates the shard URLs.
//   /sitemap/<id>.xml    → app/sitemap/[shard]/route.ts: dispatches by id.
//
// The shard ID layout (4 fixed non-job shards + N job shards) and the
// per-shard URL helpers live in lib/seo/sitemap-shards.ts and are
// unchanged. Only the entry points moved.

import { getJobShardCount, SHARD_JOBS_BASE } from '../../lib/seo/sitemap-shards';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://jobportal.com';

// 1h cache + 6h SWR, same policy that next.config.ts headers applied to
// the old metadata-file output.
export const revalidate = 3600;

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(): Promise<Response> {
  const jobShards = await getJobShardCount();
  // 4 fixed non-job shards (static, companies, articles, landings) +
  // one entry per job shard. Always emit the 4 even when their content
  // is empty — the shard handler serves a valid empty <urlset/> in that
  // case, which is better than dropping the URL.
  const ids: number[] = [0, 1, 2, 3];
  for (let i = 0; i < jobShards; i++) ids.push(SHARD_JOBS_BASE + i);

  const entries = ids
    .map((id) => `  <sitemap><loc>${xmlEscape(`${SITE}/sitemap/${id}.xml`)}</loc></sitemap>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=21600',
    },
  });
}
