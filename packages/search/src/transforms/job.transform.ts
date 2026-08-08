import type { EmploymentType, JobDoc, WorkMode } from '../types';

// Inputs the transform needs (we pass them as a flat record so the call sites
// can pre-fetch the lookups in batches for bulk indexing).

export type JobInput = {
  id: number;
  canonicalSlug: string;
  title: string;
  description: string;
  shortDescription: string | null;
  companyId: number;
  primaryCityId: number | null;
  cityIds: number[];
  skillIds: number[];
  industryId: number | null;
  functionalAreaId: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';
  employmentType: EmploymentType;
  workMode: WorkMode;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  postedAt: Date;
  expiresAt: Date | null;
};

export type JobLookups = {
  companies: Map<number, { name: string; slug: string }>;
  cities: Map<number, { slug: string }>;
  skills: Map<number, { slug: string; name: string }>;
  industries: Map<number, { slug: string }>;
  functionalAreas: Map<number, { slug: string }>;
};

export function jobToDoc(job: JobInput, lookups: JobLookups): JobDoc {
  const company = lookups.companies.get(job.companyId);
  if (!company) throw new Error(`Job ${job.id} references missing company ${job.companyId}`);

  const skillRows = job.skillIds
    .map((id) => lookups.skills.get(id))
    .filter((s): s is { slug: string; name: string } => s !== undefined);

  const cityRows = job.cityIds
    .map((id) => lookups.cities.get(id))
    .filter((c): c is { slug: string } => c !== undefined);

  const primaryCity = job.primaryCityId !== null ? lookups.cities.get(job.primaryCityId) ?? null : null;
  const industry = job.industryId !== null ? lookups.industries.get(job.industryId) ?? null : null;
  const functionalArea =
    job.functionalAreaId !== null ? lookups.functionalAreas.get(job.functionalAreaId) ?? null : null;

  return {
    id: job.id,
    canonicalSlug: job.canonicalSlug,
    title: job.title,
    description: job.description,
    shortDescription: job.shortDescription,
    companyId: job.companyId,
    companyName: company.name,
    companySlug: company.slug,
    skills: skillRows.map((s) => s.name),
    skillSlugs: skillRows.map((s) => s.slug),
    skillIds: job.skillIds,
    citySlugs: cityRows.map((c) => c.slug),
    cityIds: job.cityIds,
    primaryCitySlug: primaryCity?.slug ?? null,
    industrySlug: industry?.slug ?? null,
    industryId: job.industryId,
    functionalAreaSlug: functionalArea?.slug ?? null,
    status: job.status,
    // Stored verbatim, like `status`. Both columns are NOT NULL with a default
    // in Postgres, so there is no null branch to model here.
    employmentType: job.employmentType,
    workMode: job.workMode,
    minExperienceMonths: job.experienceMinYears !== null ? job.experienceMinYears * 12 : null,
    maxExperienceMonths: job.experienceMaxYears !== null ? job.experienceMaxYears * 12 : null,
    salaryMin: job.salaryMinPaise,
    salaryMax: job.salaryMaxPaise,
    postedAt: job.postedAt.toISOString(),
    expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
    title_suggest: { input: [job.title, company.name].filter(Boolean) },
  };
}
