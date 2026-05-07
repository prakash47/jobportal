import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { SrpShell } from '../../../components/srp';
import { loadSrpUserContext, parseSrpSearchParams, skillBreadcrumb } from '../../../lib/srp';
import type { ItemListEntry } from '../../../lib/seo/json-ld';

const PAGE_SIZE = 20;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ skill: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { skill: skillSlug } = await params;
  const skill = await prisma.skill.findUnique({
    where: { slug: skillSlug },
    select: { name: true },
  });
  if (!skill) return { title: 'Not found' };
  return {
    title: `${skill.name} jobs — JobPortal`,
    description: `Latest ${skill.name} job openings across India. Filter by city, salary, and experience.`,
  };
}

export default async function SkillJobsPage({ params, searchParams }: PageProps) {
  const { skill: skillSlug } = await params;
  const sp = await searchParams;

  const skill = await prisma.skill.findUnique({
    where: { slug: skillSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!skill) notFound();

  const queryParams = parseSrpSearchParams(sp);
  const page = queryParams.page ?? 1;

  const [results, skills, cities, industries] = await Promise.all([
    searchJobs({
      ...queryParams,
      // Force the path-bound skill into the filter; can be combined with extra
      // ?skill=... params if the user added more from the sidebar.
      skillSlugs: [skill.slug, ...(queryParams.skillSlugs ?? []).filter((s) => s !== skill.slug)],
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

  const title = `${skill.name} jobs`;
  const basePath = `/${skill.slug}-jobs`;

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
      breadcrumbs={skillBreadcrumb(skill.name, skill.slug)}
      hideSkillFilter
      skills={skills}
      cities={cities}
      industries={industries}
      isAuthed={userCtx.isAuthed}
      savedJobIds={userCtx.savedJobIds}
      returnTo={basePath}
    />
  );
}
