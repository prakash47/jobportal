import type { ReactNode } from 'react';
import { Container, Pagination as UiPagination } from '@jobportal/ui';
import type { SearchJobsResult } from '@jobportal/search';
import { JobCard } from './JobCard';
import { FilterSidebar, type FilterOption } from './FilterSidebar';
import { SortSelect } from './SortSelect';
import { MobileFilterSheet } from './MobileFilterSheet';
import { RelatedSearches } from './RelatedSearches';
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
  /** Hide skill filter on /[skill]-jobs routes (the skill is fixed by the URL). */
  hideSkillFilter?: boolean;
  /** Hide city filter on /jobs-in-[city] routes (city is fixed by URL). */
  hideCityFilter?: boolean;
  /** Pre-fetched filter options. */
  skills: FilterOption[];
  cities: FilterOption[];
  industries: FilterOption[];
  /** Optional banner shown above the results (e.g., "Searching for 'react'"). */
  resultsBanner?: ReactNode;
  /** Per-user state — flips the JobCard save toggle into its right shape. */
  isAuthed?: boolean;
  savedJobIds?: Set<number>;
  /** Path the login bounce should return to after sign-in. */
  returnTo?: string;
}

export function SrpShell({
  basePath,
  pageTitle,
  resultCount,
  results,
  page,
  pageSize,
  jsonLdItems,
  jsonLdName,
  breadcrumbs,
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
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const sidebar = (
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
    <>
      <JsonLd value={breadcrumbList(breadcrumbs)} />
      <JsonLd value={itemList({ name: jsonLdName, items: jsonLdItems })} />
      <Container className="py-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{pageTitle}</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {resultCount.toLocaleString('en-IN')} {resultCount === 1 ? 'job' : 'jobs'}
          </p>
        </header>

        <div className="mb-4 flex items-center justify-between gap-3">
          <MobileFilterSheet>{sidebar}</MobileFilterSheet>
          <div className="ml-auto">
            <SortSelect basePath={basePath} />
          </div>
        </div>

        {resultsBanner}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden lg:block">{sidebar}</div>

          <main aria-label="Search results" className="min-w-0">
            {results.hits.length === 0 ? (
              <RelatedSearches />
            ) : (
              <ul className="space-y-3">
                {results.hits.map((job) => (
                  <li key={job.id}>
                    <JobCard
                      job={job}
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
          </main>
        </div>
      </Container>
    </>
  );
}

// Pagination reuses the @jobportal/ui Pagination shape but renders <a> tags
// (real navigations) so search-engine crawlers index page 2..N. This is server
// component; the UI Pagination is a client component, so we re-implement the
// numeric layout here as Links.
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

// Suppress UiPagination unused-import warning while keeping the package tree clean.
void UiPagination;
