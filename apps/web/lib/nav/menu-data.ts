import { unstable_cache } from 'next/cache';
import { loadHomePageData } from '../home/queries';

// Data for the Jobs/Companies navbar mega-menu. A DATE-FREE subset of
// loadHomePageData() so it is safe to cache as JSON, wrapped in the Next Data
// Cache (revalidate 30 min): the site header renders on EVERY page, so this
// makes the menu one shared computation per window instead of a DB round-trip
// per request. Because it draws from the same source query as the home page,
// the menu counts can never disagree with the /jobs and /companies totals.

export interface NavTaxonomyItem {
  slug: string;
  name: string;
  jobCount: number;
}

export interface NavRoleItem {
  label: string;
  query: string; // SRP ?q= value
  jobCount: number;
}

export interface NavFeaturedCompany {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  averageRating: number | null;
  openingsCount: number;
}

export interface NavMenuData {
  counts: { activeJobs: number; companies: number };
  roles: NavRoleItem[];
  cities: NavTaxonomyItem[];
  industries: NavTaxonomyItem[];
  skills: NavTaxonomyItem[];
  featuredCompanies: NavFeaturedCompany[];
}

const GROUP_CAP = 6;
const FEATURED_CAP = 5;

export const loadNavMenuData = unstable_cache(
  async (): Promise<NavMenuData> => {
    const d = await loadHomePageData();
    return {
      counts: { activeJobs: d.counts.activeJobs, companies: d.counts.companies },
      roles: d.topRoles
        .slice(0, GROUP_CAP)
        .map((r) => ({ label: r.label, query: r.query, jobCount: r.jobCount })),
      cities: d.popularCities
        .slice(0, GROUP_CAP)
        .map((c) => ({ slug: c.slug, name: c.name, jobCount: c.jobCount })),
      industries: d.topIndustries
        .slice(0, GROUP_CAP)
        .map((i) => ({ slug: i.slug, name: i.name, jobCount: i.jobCount })),
      skills: d.popularSkills
        .slice(0, GROUP_CAP)
        .map((s) => ({ slug: s.slug, name: s.name, jobCount: s.jobCount })),
      featuredCompanies: d.featuredCompanies.slice(0, FEATURED_CAP).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        logoUrl: c.logoUrl,
        averageRating: c.averageRating,
        openingsCount: c.openingsCount,
      })),
    };
  },
  ['nav-menu-data-v1'],
  { revalidate: 1800, tags: ['nav-menu'] },
);
