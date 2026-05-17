// /<skill>-jobs-in-<city[s]> — composed SEO landing.
//
// Dispatched from the [...path] catch-all (chip #13). Filters jobs by
// BOTH a skill and one-or-more cities (cities joined by `-and-`, sorted
// alphabetically per SRS §6.3 rule 3).
//
// Examples:
//   /python-jobs-in-bangalore
//   /react-jobs-in-bangalore-and-mumbai
//   /node-js-jobs-in-pune

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { SrpShell } from '../../../components/srp';
import {
  loadSrpUserContext,
  parseSrpSearchParams,
  skillCityBreadcrumb,
} from '../../../lib/srp';
import { buildMultiCitySlug } from '../../../lib/url/slug';
import type { ItemListEntry } from '../../../lib/seo/json-ld';

const PAGE_SIZE = 20;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ skill: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function resolveCities(citySegment: string): Promise<{ slug: string; name: string }[] | null> {
  const slugs = citySegment.includes('-and-') ? citySegment.split('-and-') : [citySegment];
  if (slugs.some((s) => !s || !/^[a-z0-9-]+$/.test(s))) return null;
  const cities = await prisma.city.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
  });
  if (cities.length !== slugs.length) return null;
  const bySlug = new Map(cities.map((c) => [c.slug, c]));
  return slugs.map((s) => bySlug.get(s)!).filter(Boolean);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { skill: skillSlug, city: citySegment } = await params;
  const [skill, cities] = await Promise.all([
    prisma.skill.findUnique({ where: { slug: skillSlug }, select: { name: true } }),
    resolveCities(citySegment),
  ]);
  if (!skill || !cities) return { title: 'Not found' };

  const cityLabel = cities.map((c) => c.name).join(', ');
  return {
    title: `${skill.name} jobs in ${cityLabel} — JobPortal`,
    description: `Latest ${skill.name} job openings in ${cityLabel}. Filter by salary and experience.`,
  };
}

export default async function SkillCityJobsPage({ params, searchParams }: PageProps) {
  const { skill: skillSlug, city: citySegment } = await params;
  const sp = await searchParams;

  const [skill, cityRows] = await Promise.all([
    prisma.skill.findUnique({
      where: { slug: skillSlug },
      select: { id: true, slug: true, name: true },
    }),
    resolveCities(citySegment),
  ]);
  if (!skill || !cityRows) notFound();

  const citySlugs = cityRows.map((c) => c.slug);

  // Canonical-sort guard for multi-city segments (per SRS §6.3 rule 3).
  if (citySlugs.length > 1) {
    const sorted = [...citySlugs].sort();
    if (citySlugs.some((s, i) => s !== sorted[i])) notFound();
  }

  const queryParams = parseSrpSearchParams(sp);
  const page = queryParams.page ?? 1;

  const [results, skills, cities, industries] = await Promise.all([
    searchJobs({
      ...queryParams,
      skillSlugs: [skill.slug, ...(queryParams.skillSlugs ?? []).filter((s) => s !== skill.slug)],
      citySlugs,
      pageSize: PAGE_SIZE,
    }),
    prisma.skill.findMany({
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    prisma.city.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.industry.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const userCtx = await loadSrpUserContext(results.hits.map((j) => j.id));

  const items: ItemListEntry[] = results.hits.map((j) => ({
    name: j.title,
    url: `${SITE}/job/${j.canonicalSlug}`,
  }));

  const cityNames = cityRows.map((c) => c.name);
  const cityLabel = cityNames.join(', ');
  const title = `${skill.name} jobs in ${cityLabel}`;
  const basePath =
    citySlugs.length === 1
      ? `/${skill.slug}-jobs-in-${citySlugs[0]}`
      : `/${skill.slug}-jobs-in-${buildMultiCitySlug(citySlugs).replace(/^jobs-in-/, '')}`;

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
      breadcrumbs={skillCityBreadcrumb(skill.name, skill.slug, cityNames, basePath)}
      hideSkillFilter
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
