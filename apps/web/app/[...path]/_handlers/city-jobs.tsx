// /jobs-in-[city] SEO landing — dispatched from the [...path] catch-all.
//
// Original location: apps/web/app/jobs-in-[city]/page.tsx (deleted).
// Supports multi-city slugs via `-and-` separator (sorted alphabetically
// per SRS §6.3 rule 3).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { SrpShell } from '../../../components/srp';
import { cityBreadcrumb, loadSrpUserContext, parseSrpSearchParams } from '../../../lib/srp';
import { buildMultiCitySlug, parseMultiCitySlug } from '../../../lib/url/slug';
import type { ItemListEntry } from '../../../lib/seo/json-ld';

const PAGE_SIZE = 20;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function resolveCities(citySegment: string): Promise<{ slug: string; name: string }[] | null> {
  // The path is `jobs-in-<rest>` — the dispatcher passes <rest> as `city`.
  // <rest> may be a single slug or multiple joined by `-and-`.
  const slugs = citySegment.includes('-and-') ? citySegment.split('-and-') : [citySegment];
  if (slugs.some((s) => !s || !/^[a-z0-9-]+$/.test(s))) return null;
  const cities = await prisma.city.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
  });
  if (cities.length !== slugs.length) return null;
  // Preserve URL order so the breadcrumb reflects the canonical sort.
  const bySlug = new Map(cities.map((c) => [c.slug, c]));
  return slugs.map((s) => bySlug.get(s)!).filter(Boolean);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: citySegment } = await params;
  const cities = await resolveCities(citySegment);
  if (!cities) return { title: 'Not found' };
  const label =
    cities.length === 1 ? `Jobs in ${cities[0]!.name}` : `Jobs in ${cities.map((c) => c.name).join(', ')}`;
  return {
    title: `${label} — JobPortal`,
    description: `Latest job openings ${label.toLowerCase()}. Filter by skill, salary, and experience.`,
  };
}

export default async function CityJobsPage({ params, searchParams }: PageProps) {
  const { city: citySegment } = await params;
  const sp = await searchParams;

  const cityRows = await resolveCities(citySegment);
  if (!cityRows) notFound();

  // Verify the segment is canonically sorted; if not, middleware would
  // reject in production. Belt+braces: 404 here too.
  const slugs = cityRows.map((c) => c.slug);
  if (slugs.length > 1) {
    const sortedSlugs = [...slugs].sort();
    if (slugs.some((s, i) => s !== sortedSlugs[i])) notFound();
  }
  void parseMultiCitySlug;

  const queryParams = parseSrpSearchParams(sp);
  const page = queryParams.page ?? 1;

  const [results, skills, cities, industries] = await Promise.all([
    searchJobs({
      ...queryParams,
      citySlugs: slugs,
      pageSize: PAGE_SIZE,
    }),
    prisma.skill.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.city.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.industry.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const userCtx = await loadSrpUserContext(results.hits.map((j) => j.id));

  const items: ItemListEntry[] = results.hits.map((j) => ({
    name: j.title,
    url: `${SITE}/job/${j.canonicalSlug}`,
  }));

  const cityNames = cityRows.map((c) => c.name);
  const title =
    cityNames.length === 1 ? `Jobs in ${cityNames[0]}` : `Jobs in ${cityNames.join(', ')}`;
  const basePath =
    slugs.length === 1 ? `/jobs-in-${slugs[0]}` : `/${buildMultiCitySlug(slugs)}`;

  return (
    <SrpShell
      basePath={basePath}
      pageTitle={title}
      resultCount={results.total}
      results={results}
      page={page}
      pageSize={PAGE_SIZE}
      jsonLdItems={items}
      jsonLdName={title}
      breadcrumbs={cityBreadcrumb(cityNames, basePath)}
      hideCityFilter
      skills={skills}
      cities={cities}
      industries={industries}
      isAuthed={userCtx.isAuthed}
      savedJobIds={userCtx.savedJobIds}
      returnTo={basePath}
    />
  );
}
