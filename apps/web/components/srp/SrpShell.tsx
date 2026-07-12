import { prisma } from '@jobportal/db';
import { Container } from '@jobportal/ui';
import { Filter } from '@jobportal/ui/icons';
import type { SearchJobsResult } from '@jobportal/search';
import { SiteShell } from '../shell/SiteShell';
import { SrpSearchExpand } from './SrpSearchExpand';
import { JobCard } from './JobCard';
import { FilterSidebar, type FilterOption } from './FilterSidebar';
import { SortSelect } from './SortSelect';
import { MobileFilterSheet } from './MobileFilterSheet';
import { ActiveFilterChips } from './ActiveFilterChips';
import { QuickSearches } from './QuickSearches';
import { RelatedSearches } from './RelatedSearches';
import { SrpRail } from './SrpRail';
import { SrpPaginationLink } from './SrpPaginationLink';
import { JsonLd } from '../../lib/seo';
import {
  breadcrumbList,
  itemList,
  type BreadcrumbEntry,
  type ItemListEntry,
} from '../../lib/seo/json-ld';

export interface SrpShellProps {
  basePath: string;
  pageTitle: string;
  resultCount: number;
  results: SearchJobsResult;
  page: number;
  pageSize: number;
  jsonLdItems: ItemListEntry[];
  jsonLdName: string;
  breadcrumbs: BreadcrumbEntry[];
  /** Prefill the SRP search box with the current query (null on landing pages). */
  searchQuery?: string | undefined;
  /** Hide skill filter on /[skill]-jobs routes (the skill is fixed by the URL). */
  hideSkillFilter?: boolean;
  /** Hide city filter on /jobs-in-[city] routes (city is fixed by URL). */
  hideCityFilter?: boolean;
  /** Pre-fetched filter options. */
  skills: FilterOption[];
  cities: FilterOption[];
  industries: FilterOption[];
  /** Optional banner shown above the results (e.g., "Searching for 'react'"). */
  resultsBanner?: React.ReactNode;
  /** Per-user state — flips the JobCard save toggle into its right shape. */
  isAuthed?: boolean;
  savedJobIds?: Set<number>;
  /** Path the login bounce should return to after sign-in. */
  returnTo?: string;
}

// The shared search-results shell for every SRP route (/jobs + the [...path]
// SEO landings). Wraps the results in the site shell (header + footer), a
// prominent search + sort + active-filter toolbar, and a 3-column grid:
//   left  — the filter rail (a Dialog sheet on mobile)
//   center— the job cards
//   right — the alert CTA + "roles at other companies" rail (xl+ only)
// The ES doc carries neither company logos nor display city names, so both are
// resolved once here in two batched Prisma lookups keyed by the visible hits
// (no per-card query) and threaded into each JobCard.
export async function SrpShell({
  basePath,
  pageTitle,
  resultCount,
  results,
  page,
  pageSize,
  jsonLdItems,
  jsonLdName,
  breadcrumbs,
  searchQuery,
  hideSkillFilter,
  hideCityFilter,
  skills,
  cities,
  industries,
  resultsBanner,
  isAuthed = false,
  savedJobIds,
  returnTo,
}: SrpShellProps) {
  const companyIds = [...new Set(results.hits.map((j) => j.companyId))];
  const citySlugs = [...new Set(results.hits.flatMap((j) => (j.primaryCitySlug ? [j.primaryCitySlug] : [])))];
  const [companies, cityRows] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, logoUrl: true } })
      : Promise.resolve<{ id: number; logoUrl: string | null }[]>([]),
    citySlugs.length > 0
      ? prisma.city.findMany({ where: { slug: { in: citySlugs } }, select: { slug: true, name: true } })
      : Promise.resolve<{ slug: string; name: string }[]>([]),
  ]);
  const logoByCompanyId = new Map(companies.map((c) => [c.id, c.logoUrl]));
  const cityNameBySlug = new Map(cityRows.map((c) => [c.slug, c.name]));

  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const filters = (
    <FilterSidebar
      basePath={basePath}
      skills={skills}
      cities={cities}
      industries={industries}
      showSkill={!hideSkillFilter}
      showCity={!hideCityFilter}
    />
  );

  return (
    <SiteShell>
      <JsonLd value={breadcrumbList(breadcrumbs)} />
      <JsonLd value={itemList({ name: jsonLdName, items: jsonLdItems })} />
      <Container className="py-6 lg:py-8">
        {/* Search header: title, a prominent search bar with an integrated
            Search button, and one-tap popular searches. */}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{pageTitle}</h1>

        <div className="mt-4">
          <SrpSearchExpand
            key={searchQuery ?? ''}
            cities={cities}
            {...(searchQuery ? { initialQuery: searchQuery } : {})}
          />
        </div>

        <QuickSearches className="mt-3.5" />

        {/* Controls toolbar — result count on the left, filters/sort on the
            right — set off from the search zone by a hairline. Balanced instead
            of the old lone sort floating in empty space. */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm text-[var(--color-fg-muted)]">
            <span className="font-semibold text-[var(--color-fg)]">
              {resultCount.toLocaleString('en-IN')}
            </span>{' '}
            {resultCount === 1 ? 'job' : 'jobs'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <MobileFilterSheet>{filters}</MobileFilterSheet>
            <SortSelect basePath={basePath} />
          </div>
        </div>

        <div className="mt-3 empty:hidden">
          <ActiveFilterChips basePath={basePath} skills={skills} cities={cities} industries={industries} />
        </div>

        {resultsBanner}

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
          <div className="hidden lg:block">
            <div className="lg:sticky lg:top-20">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4">
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] py-3.5 text-sm font-semibold text-[var(--color-fg)]">
                  <Filter className="size-4" aria-hidden="true" />
                  Filters
                </div>
                {filters}
              </div>
            </div>
          </div>

          <section aria-label="Search results" className="min-w-0">
            {results.hits.length === 0 ? (
              <RelatedSearches />
            ) : (
              <ul className="space-y-3 sm:space-y-4">
                {results.hits.map((job) => (
                  <li key={job.id}>
                    <JobCard
                      job={job}
                      logoUrl={logoByCompanyId.get(job.companyId) ?? null}
                      cityName={job.primaryCitySlug ? (cityNameBySlug.get(job.primaryCitySlug) ?? null) : null}
                      isAuthed={isAuthed}
                      initialSaved={savedJobIds?.has(job.id) ?? false}
                      {...(returnTo ? { returnTo } : {})}
                    />
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-8 flex justify-center">
                <SrpPagination basePath={basePath} page={page} totalPages={totalPages} />
              </nav>
            )}
          </section>

          <aside className="hidden xl:block" aria-label="More for you">
            <div className="xl:sticky xl:top-20">
              <SrpRail hits={results.hits} alertHref="/alerts/new" />
            </div>
          </aside>
        </div>
      </Container>
    </SiteShell>
  );
}

// Pagination reuses the @jobportal/ui Pagination shape but renders <a> tags
// (real navigations) so search-engine crawlers index page 2..N. This is a
// server component; the UI Pagination is a client component, so we re-implement
// the numeric layout here as Links.
function SrpPagination({ basePath, page, totalPages }: { basePath: string; page: number; totalPages: number }) {
  const pages: Array<number | 'ellipsis'> = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i += 1) pages.push(i);
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <ul className="flex items-center gap-1">
      <li>
        <SrpPaginationLink basePath={basePath} page={page - 1} disabled={page <= 1} label="Previous" arrow="prev" />
      </li>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <li key={`e-${i}`}>
            <span className="inline-flex size-8 items-center justify-center text-sm text-[var(--color-fg-subtle)]">
              …
            </span>
          </li>
        ) : (
          <li key={p}>
            <SrpPaginationLink basePath={basePath} page={p} active={p === page} label={String(p)} />
          </li>
        ),
      )}
      <li>
        <SrpPaginationLink basePath={basePath} page={page + 1} disabled={page >= totalPages} label="Next" arrow="next" />
      </li>
    </ul>
  );
}
