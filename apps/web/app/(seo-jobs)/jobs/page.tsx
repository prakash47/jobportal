import type { Metadata } from 'next';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { SrpShell } from '../../../components/srp';
import { homeOnly, parseSrpSearchParams } from '../../../lib/srp';
import type { ItemListEntry } from '../../../lib/seo/json-ld';

const PAGE_SIZE = 20;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Jobs — JobPortal',
  description: 'Find your next role. Filter by skill, city, salary, and experience.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = parseSrpSearchParams(sp);
  const page = params.page ?? 1;

  const [results, skills, cities, industries] = await Promise.all([
    searchJobs({ ...params, pageSize: PAGE_SIZE }),
    prisma.skill.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.city.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.industry.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const items: ItemListEntry[] = results.hits.map((j) => ({
    name: j.title,
    url: `${SITE}/job/${j.canonicalSlug}`,
  }));

  const title = params.q ? `Search results for "${params.q}"` : 'All jobs';
  const banner =
    params.q !== undefined ? (
      <p className="mb-4 text-sm text-[var(--color-fg-muted)]">
        Showing matches for <span className="font-medium text-[var(--color-fg)]">"{params.q}"</span>.
      </p>
    ) : null;

  return (
    <SrpShell
      basePath="/jobs"
      pageTitle={title}
      resultCount={results.total}
      results={results}
      page={page}
      pageSize={PAGE_SIZE}
      jsonLdItems={items}
      jsonLdName={title}
      breadcrumbs={homeOnly()}
      skills={skills}
      cities={cities}
      industries={industries}
      resultsBanner={banner}
    />
  );
}
