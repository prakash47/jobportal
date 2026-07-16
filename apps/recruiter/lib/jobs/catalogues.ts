import { prisma } from '@jobportal/db';

// The reference lists the posting form needs (city/area dropdowns, skill
// chips, department/industry selects). Shared by the /post-job page and the
// /jobs/[id]/edit page so the two forms can never drift on what they offer.
export interface JobFormCatalogues {
  skills: { id: number; slug: string; name: string }[];
  cities: { id: number; slug: string; name: string }[];
  localities: { id: number; name: string; cityId: number }[];
  industries: { id: number; slug: string; name: string }[];
  functionalAreas: { id: number; slug: string; name: string }[];
}

export async function loadJobFormCatalogues(): Promise<JobFormCatalogues> {
  const [skills, cities, localities, industries, functionalAreas] = await Promise.all([
    prisma.skill.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.city.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Sub-city areas for the City → Area selector; filtered client-side by city.
    prisma.locality.findMany({
      select: { id: true, name: true, cityId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.industry.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.functionalArea.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return { skills, cities, localities, industries, functionalAreas };
}
