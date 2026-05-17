// Sitemap shard handler — mounts at /sitemap/<id>.xml.
//
// Next routes /sitemap/0.xml here with params.shard = '0.xml'. We strip
// the `.xml` suffix before parsing. The shard id maps to one of:
//   0 → static URLs (homepage + /jobs + /companies + /career-advice)
//   1 → company overview + working-at pages
//   2 → PUBLISHED career-advice articles
//   3 → SEO landing pages (skill / city, filtered for non-thin content)
//   4+ → ACTIVE job detail pages, 40k per shard (id - 4 = shard index)
//
// Out-of-range or non-numeric ids return an empty <urlset/> (valid
// sitemap XML) rather than 404, so a stale sitemap-index reference
// doesn't break the crawl.

import {
  getArticleUrls,
  getCompanyUrls,
  getJobShard,
  getLandingUrls,
  getStaticUrls,
  SHARD_ARTICLES,
  SHARD_COMPANIES,
  SHARD_JOBS_BASE,
  SHARD_LANDINGS,
  SHARD_STATIC,
} from '../../../lib/seo/sitemap-shards';

export const revalidate = 3600;

// Matches Next's MetadataRoute.Sitemap entry shape — including the
// `| undefined` that `exactOptionalPropertyTypes: true` makes load-bearing.
interface UrlEntry {
  url: string;
  lastModified?: Date | string | undefined;
  changeFrequency?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
    | undefined;
  priority?: number | undefined;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toIso(v: Date | string | undefined): string | null {
  if (v === undefined) return null;
  return typeof v === 'string' ? v : v.toISOString();
}

function renderUrlset(entries: ReadonlyArray<UrlEntry>): string {
  const items = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.url)}</loc>`];
      const lm = toIso(e.lastModified);
      if (lm) parts.push(`    <lastmod>${xmlEscape(lm)}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined) parts.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
}

async function urlsFor(id: number): Promise<UrlEntry[]> {
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
      if (!Number.isFinite(shardIndex) || shardIndex < 0) return [];
      return getJobShard(shardIndex);
    }
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shard: string }> },
): Promise<Response> {
  const { shard } = await ctx.params;
  // Strip the literal `.xml` if present so /sitemap/0.xml and /sitemap/0
  // both work. Search engines hit the .xml form; the trimmed form is a
  // forgiving fallback.
  const raw = shard.replace(/\.xml$/, '');
  const id = Number(raw);
  const entries: UrlEntry[] = Number.isFinite(id) ? await urlsFor(id) : [];

  // Cache-Control owned by next.config.ts (/sitemap/:path* source rule).
  return new Response(renderUrlset(entries), {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
