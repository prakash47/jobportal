import type { Metadata } from 'next';
import { loadHomePageData } from '../lib/home/queries';
import { JsonLd } from '../lib/seo';
import {
  BentoValue,
  FaqSection,
  FeaturedCompanies,
  Hero,
  IndustriesGrid,
  PopularCitiesGrid,
  PopularSkillsGrid,
  RecentArticles,
  RecruiterCta,
  RolesGrid,
  SiteFooter,
  SiteHeader,
  TrustStrip,
} from '../components/home';

// Public homepage. SSR + 30-min revalidate (counts can lag half an hour;
// the underlying queries are cheap but a steady stream of crawlers + cold
// visits would still benefit from edge caching). Self-canonical comes from
// the root layout's <CanonicalLink />.

export const revalidate = 1800;

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'JobPortal — Find your next role in India',
  description:
    'A calmer way to search jobs across India. No ads, no clutter — just openings that match your skills, city, and experience.',
};

export default async function HomePage() {
  const data = await loadHomePageData();

  // WebSite + potentialAction = SearchAction. This is what Google reads to
  // render a sitelinks search box under the JobPortal result in SERPs.
  // https://developers.google.com/search/docs/appearance/sitelinks-search-box
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: SITE,
    name: 'JobPortal',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE}/jobs?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <JsonLd value={websiteJsonLd} />

      <SiteHeader />

      <main>
        <Hero cities={data.popularCities} />
        <TrustStrip
          activeJobs={data.counts.activeJobs}
          companies={data.counts.companies}
          recruiters={data.counts.recruiters}
        />
        <BentoValue />
        <IndustriesGrid industries={data.topIndustries} />
        <RolesGrid roles={data.topRoles} />
        <PopularCitiesGrid cities={data.popularCities} />
        <PopularSkillsGrid skills={data.popularSkills} />
        <FeaturedCompanies companies={data.featuredCompanies} />
        <RecentArticles articles={data.recentArticles} />
        <FaqSection />
        <RecruiterCta />
      </main>

      <SiteFooter />
    </>
  );
}
