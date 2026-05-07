import { prisma } from '@jobportal/db';
import { es, INDEX_ALIAS } from '../client';
import { companyToDoc, type CompanyInput, type CompanyLookups } from '../transforms/company.transform';

async function buildLookupsFor(companies: CompanyInput[]): Promise<CompanyLookups> {
  const cityIds = [...new Set(companies.map((c) => c.headquartersCityId).filter((x): x is number => x !== null))];
  const industryIds = [...new Set(companies.map((c) => c.industryId).filter((x): x is number => x !== null))];

  const [cities, industries] = await Promise.all([
    cityIds.length
      ? prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
    industryIds.length
      ? prisma.industry.findMany({ where: { id: { in: industryIds } }, select: { id: true, slug: true } })
      : Promise.resolve([]),
  ]);

  return {
    cities: new Map(cities.map((c) => [c.id, { slug: c.slug }])),
    industries: new Map(industries.map((i) => [i.id, { slug: i.slug }])),
  };
}

export async function indexCompany(companyId: number, indexName: string = INDEX_ALIAS.companies): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    await removeCompany(companyId, indexName);
    return;
  }
  const lookups = await buildLookupsFor([company as unknown as CompanyInput]);
  const doc = companyToDoc(company as unknown as CompanyInput, lookups);
  await es.index({ index: indexName, id: String(companyId), document: doc, refresh: 'wait_for' });
}

export async function removeCompany(companyId: number, indexName: string = INDEX_ALIAS.companies): Promise<void> {
  await es.delete({ index: indexName, id: String(companyId), refresh: 'wait_for' }).catch((err: { meta?: { statusCode?: number } }) => {
    if (err.meta?.statusCode === 404) return;
    throw err;
  });
}

export async function bulkIndexCompanies(
  companies: CompanyInput[],
  indexName: string,
): Promise<{ indexed: number; failed: number }> {
  if (companies.length === 0) return { indexed: 0, failed: 0 };
  const lookups = await buildLookupsFor(companies);
  const operations = companies.flatMap((c) => [
    { index: { _index: indexName, _id: String(c.id) } },
    companyToDoc(c, lookups),
  ]);
  const result = await es.bulk({ operations, refresh: false });
  let failed = 0;
  if (result.errors) {
    for (const item of result.items) {
      const op = item.index ?? item.create ?? item.update ?? item.delete;
      if (op?.error) failed += 1;
    }
  }
  return { indexed: companies.length - failed, failed };
}
