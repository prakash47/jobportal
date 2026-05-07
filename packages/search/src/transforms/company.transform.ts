import type { CompanyDoc } from '../types';

export type CompanyInput = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  industryId: number | null;
  headquartersCityId: number | null;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export type CompanyLookups = {
  cities: Map<number, { slug: string }>;
  industries: Map<number, { slug: string }>;
};

export function companyToDoc(company: CompanyInput, lookups: CompanyLookups): CompanyDoc {
  const industry = company.industryId !== null ? lookups.industries.get(company.industryId) ?? null : null;
  const hq =
    company.headquartersCityId !== null ? lookups.cities.get(company.headquartersCityId) ?? null : null;

  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    description: company.description,
    industrySlug: industry?.slug ?? null,
    industryId: company.industryId,
    headquartersCitySlug: hq?.slug ?? null,
    headquartersCityId: company.headquartersCityId,
    logoUrl: company.logoUrl,
    websiteUrl: company.websiteUrl,
    name_suggest: { input: [company.name] },
  };
}
