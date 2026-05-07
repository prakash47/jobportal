import { prisma } from '@jobportal/db';
import { es, INDEX_ALIAS } from '../client';
import { jobToDoc, type JobInput, type JobLookups } from '../transforms/job.transform';

async function buildLookupsFor(jobs: JobInput[]): Promise<JobLookups> {
  const companyIds = [...new Set(jobs.map((j) => j.companyId))];
  const cityIds = [...new Set(jobs.flatMap((j) => [...j.cityIds, j.primaryCityId].filter((x): x is number => x !== null)))];
  const skillIds = [...new Set(jobs.flatMap((j) => j.skillIds))];
  const industryIds = [...new Set(jobs.map((j) => j.industryId).filter((x): x is number => x !== null))];
  const functionalAreaIds = [...new Set(jobs.map((j) => j.functionalAreaId).filter((x): x is number => x !== null))];

  const [companies, cities, skills, industries, functionalAreas] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([]),
    cityIds.length
      ? prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
    skillIds.length
      ? prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, slug: true, name: true } })
      : Promise.resolve([]),
    industryIds.length
      ? prisma.industry.findMany({ where: { id: { in: industryIds } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
    functionalAreaIds.length
      ? prisma.functionalArea.findMany({ where: { id: { in: functionalAreaIds } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
  ]);

  return {
    companies: new Map(companies.map((c) => [c.id, { name: c.name, slug: c.slug }])),
    cities: new Map(cities.map((c) => [c.id, { slug: c.slug }])),
    skills: new Map(skills.map((s) => [s.id, { slug: s.slug, name: s.name }])),
    industries: new Map(industries.map((i) => [i.id, { slug: i.slug }])),
    functionalAreas: new Map(functionalAreas.map((f) => [f.id, { slug: f.slug }])),
  };
}

export async function indexJob(jobId: number, indexName: string = INDEX_ALIAS.jobs): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    await removeJob(jobId, indexName);
    return;
  }
  const lookups = await buildLookupsFor([job as unknown as JobInput]);
  const doc = jobToDoc(job as unknown as JobInput, lookups);
  await es.index({ index: indexName, id: String(jobId), document: doc, refresh: 'wait_for' });
}

export async function removeJob(jobId: number, indexName: string = INDEX_ALIAS.jobs): Promise<void> {
  await es.delete({ index: indexName, id: String(jobId), refresh: 'wait_for' }).catch((err: { meta?: { statusCode?: number } }) => {
    if (err.meta?.statusCode === 404) return;
    throw err;
  });
}

// Bulk indexer used by the reindex script. Caller passes the target index
// (could be the alias or a versioned `jobs-vN` for zero-downtime reindex).
export async function bulkIndexJobs(jobs: JobInput[], indexName: string): Promise<{ indexed: number; failed: number }> {
  if (jobs.length === 0) return { indexed: 0, failed: 0 };
  const lookups = await buildLookupsFor(jobs);
  const operations = jobs.flatMap((job) => [
    { index: { _index: indexName, _id: String(job.id) } },
    jobToDoc(job, lookups),
  ]);
  const result = await es.bulk({ operations, refresh: false });
  let failed = 0;
  if (result.errors) {
    for (const item of result.items) {
      const op = item.index ?? item.create ?? item.update ?? item.delete;
      if (op?.error) failed += 1;
    }
  }
  return { indexed: jobs.length - failed, failed };
}
