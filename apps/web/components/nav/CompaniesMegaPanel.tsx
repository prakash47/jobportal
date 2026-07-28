import Link from 'next/link';
import { Building2, ChevronRight, Star } from '@jobportal/ui/icons';
import type { NavMenuData } from '../../lib/nav/menu-data';
import { CompanyLogo } from '../companies/CompanyLogo';
import { NavTile } from './NavTile';
import { BrowseAll, MenuStrip, navPillClass } from './menu-chrome';
import { companiesHref, companyHref } from '../../lib/nav/nav-hrefs';

// The Companies mega-panel: a strip (live count + directory collections) over
// an industry facet + a Featured Employers rail that reuses the shipped
// CompanyLogo. The industry tiles carry NO count on purpose — the only number
// we hold is a JOB count, and showing it beside a companies collection would
// misread as a company count.

const fmt = (n: number): string => n.toLocaleString('en-IN');

export function CompaniesMegaPanel({ data }: { data: NavMenuData }) {
  const showIndustries = data.industries.length >= 2;
  const showFeatured = data.featuredCompanies.length > 0;

  return (
    <div className="flex w-[36rem] max-w-[calc(100vw-1.5rem)] flex-col">
      <MenuStrip
        lead={
          <>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              Browse companies
            </span>
            <span className="text-[12.5px] text-[var(--color-fg-muted)]">
              <span className="font-semibold tabular-nums text-[var(--color-primary-600)]">
                {fmt(data.counts.companies)}
              </span>{' '}
              listed
            </span>
          </>
        }
      >
        <Link href={companiesHref({ hiring: true })} className={navPillClass}>
          Hiring now
        </Link>
        <Link href={companiesHref({})} className={navPillClass}>
          Top rated
        </Link>
        <Link href={companiesHref({ sort: 'reviews' })} className={navPillClass}>
          Most reviewed
        </Link>
        <BrowseAll href="/companies" label="All" />
      </MenuStrip>

      <div className="flex gap-6 px-5 pb-5 pt-4">
        {showIndustries && (
          <div className="w-44">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              By industry
            </h3>
            <div className="flex flex-col gap-[7px]">
              {data.industries.map((i) => (
                <NavTile key={i.slug} href={companiesHref({ category: i.slug })} icon={Building2} label={i.name} />
              ))}
            </div>
          </div>
        )}

        {showIndustries && showFeatured && <div className="w-px self-stretch bg-[var(--color-border)]" />}

        {showFeatured && (
          <div className="w-56">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              Featured employers
            </h3>
            <div className="flex flex-col gap-[7px]">
              {data.featuredCompanies.map((c, index) => (
                <Link
                  key={c.id}
                  href={companyHref(c.slug, c.id)}
                  className="group relative flex items-center gap-2.5 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 pr-7 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-primary-300)]"
                >
                  {index === 0 && (
                    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-[var(--color-accent-500)]" />
                  )}
                  <CompanyLogo companyId={c.id} name={c.name} logoUrl={c.logoUrl} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-fg)]">{c.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[var(--color-fg-muted)]">
                      {c.averageRating != null && (
                        <>
                          <Star aria-hidden="true" className="size-3 text-[var(--color-primary-500)]" />
                          <span className="tabular-nums">
                            <span className="sr-only">Rating </span>
                            {c.averageRating.toFixed(1)}
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {c.openingsCount > 0 ? (
                        <span className="tabular-nums">
                          {c.openingsCount} open {c.openingsCount === 1 ? 'role' : 'roles'}
                        </span>
                      ) : (
                        'Profile'
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 -translate-x-1 text-[var(--color-accent-500)] opacity-0 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
