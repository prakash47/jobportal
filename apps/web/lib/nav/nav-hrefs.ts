import { buildSrpHref } from '@jobportal/domain/srp-params';
import { buildDirectoryQuery, type DirectorySort } from '@jobportal/domain/company-params';

// Canonical URL builders for the navbar mega-menu. Every link is composed
// through buildSrpHref / buildDirectoryQuery so the params are alphabetically
// sorted, defaults are stripped, and spaces serialize as '+' — i.e. the URL is
// already canonical and the middleware never has to 301 it.

export const roleHref = (query: string): string => buildSrpHref('/jobs', { q: query });
export const cityHref = (slug: string): string => buildSrpHref('/jobs', { citySlugs: [slug] });
export const jobIndustryHref = (slug: string): string => buildSrpHref('/jobs', { industrySlug: slug });
export const skillHref = (slug: string): string => buildSrpHref('/jobs', { skillSlugs: [slug] });
export const newestHref = (): string => buildSrpHref('/jobs', { postedWithinDays: 7 });
export const highestPayingHref = (): string => buildSrpHref('/jobs', { sort: 'salary_desc' });

// The /companies directory uses ?category= for the industry facet (NOT
// ?industry= like the SRP). buildDirectoryQuery returns '' for the default
// (Top rated), which we render as the bare /companies path.
export function companiesHref(params: {
  category?: string;
  sort?: DirectorySort;
  hiring?: boolean;
}): string {
  const qs = buildDirectoryQuery(params);
  return qs ? `/companies?${qs}` : '/companies';
}

export const companyHref = (slug: string, id: number): string =>
  `/company/${slug}-overview-${id}`;
