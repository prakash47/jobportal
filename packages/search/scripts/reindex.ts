// MUST be first import — populates process.env.DATABASE_URL before the
// indexer chain (../src/indexers/*) drags `@jobportal/db` into the module
// graph. @jobportal/db's client.ts instantiates Prisma eagerly at
// module-evaluation time. See _load-env.ts for the full story.
import './_load-env';

import { prisma } from '@jobportal/db';
import { es, INDEX_ALIAS } from '../src/client';
import {
  ARTICLES_INDEX_MAPPING,
  ARTICLES_INDEX_SETTINGS,
  COMPANIES_INDEX_MAPPING,
  COMPANIES_INDEX_SETTINGS,
  JOBS_INDEX_MAPPING,
  JOBS_INDEX_SETTINGS,
  nextVersionedIndex,
  resolveCurrentIndexFor,
} from '../src/indexes';
import {
  bulkIndexArticles,
  bulkIndexCompanies,
  bulkIndexJobs,
} from '../src/indexers';
import type { ArticleInput } from '../src/transforms/article.transform';
import type { CompanyInput } from '../src/transforms/company.transform';
import type { JobInput } from '../src/transforms/job.transform';

const BATCH = 500;

async function reindexJobs(): Promise<{ total: number; indexName: string }> {
  const current = await resolveCurrentIndexFor(INDEX_ALIAS.jobs);
  const next = nextVersionedIndex(INDEX_ALIAS.jobs, current);

  console.log(`[reindex] jobs: building "${next}" (current: ${current ?? 'none'})`);
  await es.indices.create({
    index: next,
    settings: JOBS_INDEX_SETTINGS,
    mappings: JOBS_INDEX_MAPPING,
  });

  let cursor = 0;
  let total = 0;
  while (true) {
    const batch = await prisma.job.findMany({
      // Only jobs that have actually reached the public market. Without this
      // filter a full reindex writes DRAFT and PENDING_MODERATION documents
      // into the live alias — invisible today only because searchJobs() happens
      // to default its status filter to ACTIVE, which makes the privacy of an
      // unapproved job depend on a default in an unrelated module. The
      // incremental path (syncJob on publish) never had this problem because
      // its callers only index ACTIVE rows.
      where: { id: { gt: cursor }, status: { in: ['ACTIVE', 'EXPIRED', 'CLOSED'] } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    const { indexed, failed } = await bulkIndexJobs(batch as unknown as JobInput[], next);
    total += indexed;
    if (failed > 0) console.warn(`[reindex] jobs: ${failed} doc(s) failed in this batch`);
  }

  await es.indices.refresh({ index: next });

  // Atomic alias swap → zero search downtime.
  const actions: Record<string, { index: string; alias: string }>[] = [
    { add: { index: next, alias: INDEX_ALIAS.jobs } },
  ];
  if (current) actions.unshift({ remove: { index: current, alias: INDEX_ALIAS.jobs } });
  await es.indices.updateAliases({ actions });
  if (current && current !== next) {
    await es.indices.delete({ index: current });
    console.log(`[reindex] jobs: dropped old index "${current}"`);
  }

  return { total, indexName: next };
}

async function reindexCompanies(): Promise<{ total: number; indexName: string }> {
  const current = await resolveCurrentIndexFor(INDEX_ALIAS.companies);
  const next = nextVersionedIndex(INDEX_ALIAS.companies, current);

  console.log(`[reindex] companies: building "${next}" (current: ${current ?? 'none'})`);
  await es.indices.create({
    index: next,
    settings: COMPANIES_INDEX_SETTINGS,
    mappings: COMPANIES_INDEX_MAPPING,
  });

  let cursor = 0;
  let total = 0;
  while (true) {
    const batch = await prisma.company.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    const { indexed } = await bulkIndexCompanies(batch as unknown as CompanyInput[], next);
    total += indexed;
  }

  await es.indices.refresh({ index: next });

  const actions: Record<string, { index: string; alias: string }>[] = [
    { add: { index: next, alias: INDEX_ALIAS.companies } },
  ];
  if (current) actions.unshift({ remove: { index: current, alias: INDEX_ALIAS.companies } });
  await es.indices.updateAliases({ actions });
  if (current && current !== next) await es.indices.delete({ index: current });

  return { total, indexName: next };
}

async function reindexArticles(): Promise<{ total: number; indexName: string }> {
  const current = await resolveCurrentIndexFor(INDEX_ALIAS.articles);
  const next = nextVersionedIndex(INDEX_ALIAS.articles, current);

  console.log(`[reindex] articles: building "${next}" (current: ${current ?? 'none'})`);
  await es.indices.create({
    index: next,
    settings: ARTICLES_INDEX_SETTINGS,
    mappings: ARTICLES_INDEX_MAPPING,
  });

  let cursor = 0;
  let total = 0;
  while (true) {
    const batch = await prisma.article.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    const { indexed } = await bulkIndexArticles(batch as unknown as ArticleInput[], next);
    total += indexed;
  }

  await es.indices.refresh({ index: next });

  const actions: Record<string, { index: string; alias: string }>[] = [
    { add: { index: next, alias: INDEX_ALIAS.articles } },
  ];
  if (current) actions.unshift({ remove: { index: current, alias: INDEX_ALIAS.articles } });
  await es.indices.updateAliases({ actions });
  if (current && current !== next) await es.indices.delete({ index: current });

  return { total, indexName: next };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const [jobs, companies, articles] = await Promise.all([
    reindexJobs(),
    reindexCompanies(),
    reindexArticles(),
  ]);
  console.log('[reindex] done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log(`  jobs:      ${jobs.total} indexed → ${jobs.indexName}`);
  console.log(`  companies: ${companies.total} indexed → ${companies.indexName}`);
  console.log(`  articles:  ${articles.total} indexed → ${articles.indexName}`);
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error('[reindex] failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
