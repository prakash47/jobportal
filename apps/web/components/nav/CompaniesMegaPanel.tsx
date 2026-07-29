import { Building2, LayoutDashboard, MessageCircle, Star, TrendingUp } from '@jobportal/ui/icons';
import type { NavMenuData } from '../../lib/nav/menu-data';
import { FacetTabs, type FacetTab } from './FacetTabs';
import { CollectionList, EmployerList, FooterCount, FooterCta, PlainList } from './panel-parts';
import { companiesHref, companyHref } from '../../lib/nav/nav-hrefs';

// Companies mega-panel — the same Console shell as Jobs so the two read as one
// system. Three facets: the directory collections, employers by industry, and
// the top-rated employers.
//
// The industry rows deliberately carry NO number: the only count we hold for an
// industry is a JOB count, and printing it beside a companies collection would
// misread as a company count.

const ICON = 'size-4 shrink-0';

export function CompaniesMegaPanel({ data }: { data: NavMenuData }) {
  const tabs: FacetTab[] = [
    {
      id: 'collections',
      label: 'Collections',
      title: 'Collections',
      subtitle: 'Ways to explore employers',
      icon: <LayoutDashboard className={ICON} aria-hidden="true" />,
      panel: (
        <CollectionList
          items={[
            {
              key: 'hiring',
              label: 'Hiring now',
              hint: 'Companies with open roles',
              href: companiesHref({ hiring: true }),
              icon: TrendingUp,
            },
            {
              key: 'top-rated',
              label: 'Top rated',
              hint: 'Highest candidate ratings',
              href: companiesHref({}),
              icon: Star,
            },
            {
              key: 'most-reviewed',
              label: 'Most reviewed',
              hint: 'Most candidate reviews',
              href: companiesHref({ sort: 'reviews' }),
              icon: MessageCircle,
            },
            {
              key: 'all',
              label: 'All companies',
              hint: 'The full directory',
              href: '/companies',
              icon: Building2,
            },
          ]}
        />
      ),
    },
  ];

  if (data.industries.length >= 2) {
    tabs.push({
      id: 'industries',
      label: 'Industries',
      title: 'Industries',
      subtitle: 'Employers by sector',
      icon: <Building2 className={ICON} aria-hidden="true" />,
      panel: (
        <PlainList
          items={data.industries.map((i) => ({
            key: i.slug,
            label: i.name,
            href: companiesHref({ category: i.slug }),
          }))}
        />
      ),
    });
  }

  if (data.featuredCompanies.length > 0) {
    tabs.push({
      id: 'featured',
      label: 'Featured',
      title: 'Featured employers',
      subtitle: 'Highest rated on Career Queue',
      icon: <Star className={ICON} aria-hidden="true" />,
      panel: (
        <EmployerList
          items={data.featuredCompanies.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            logoUrl: c.logoUrl,
            averageRating: c.averageRating,
            openingsCount: c.openingsCount,
            href: companyHref(c.slug, c.id),
          }))}
        />
      ),
    });
  }

  return (
    <FacetTabs
      eyebrow="Browse companies"
      widthClass="w-[47rem] max-w-[calc(100vw-1.5rem)]"
      tabs={tabs}
      footer={
        <>
          <FooterCount value={data.counts.companies} label="companies listed" />
          <span className="flex-1" />
          <FooterCta href="/companies" label="Browse all companies" />
        </>
      }
    />
  );
}
