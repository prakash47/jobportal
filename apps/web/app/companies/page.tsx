import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, Prisma } from '@jobportal/db';
import { Container } from '@jobportal/ui';
import { Building2 } from '@jobportal/ui/icons';
import { CompanyCard } from '../../components/companies/CompanyCard';
import { CompanyFilters } from '../../components/companies/CompanyFilters';
import { IndustryShowcase, type IndustryShowcaseItem } from '../../components/companies/IndustryShowcase';
import { MobileFilterSheet } from '../../components/srp/MobileFilterSheet';
import { SiteShell } from '../../components/shell/SiteShell';
import { buildDirectoryQuery, parseDirectoryParams, type DirectorySort } from '../../lib/companies/params';
import { JsonLd } from '../../lib/seo';
import { breadcrumbList } from '../../lib/seo/json-ld';

const PAGE_SIZE = 24;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.7.1 — the directory is now wrapped in SiteShell, whose header/footer
// resolve auth server-side (cookies), so this route renders dynamically like
// the rest of the public site (home / SRP / job detail). The old edge-ISR
// (revalidate) is dropped: a personalised header can't be shared-edge-cached.

export const metadata: Metadata = {
  title: 'Companies — JobPortal',
  description: 'Browse companies hiring in India. Filter by industry, see open roles and ratings.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompaniesDirectoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { category, sort, hiring, page } = parseDirectoryParams(sp);

  const industriesRaw = await prisma.industry.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: 'asc' },
  });
  const filterIndustry = category ? industriesRaw.find((i) => i.slug === category) : null;

  const where: Prisma.CompanyWhereInput = {};
  if (filterIndustry) where.industryId = filterIndustry.id;
  if (hiring) where.jobs = { some: { status: 'ACTIVE' } };

  // Every branch ends with a unique `id` tiebreaker so offset pagination is
  // deterministic (name is not unique → adjacent skip/take calls could otherwise
  // duplicate or drop a seam row).
  const orderBy: Prisma.CompanyOrderByWithRelationInput[] =
    sort === 'name'
      ? [{ name: 'asc' }, { id: 'asc' }]
      : sort === 'reviews'
        ? [{ reviewCount: 'desc' }, { name: 'asc' }, { id: 'asc' }]
        : [{ averageRating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }];

  const [rows, total, industryCounts] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        averageRating: true,
        reviewCount: true,
        industry: { select: { name: true } },
        headquartersCity: { select: { name: true } },
      },
    }),
    prisma.company.count({ where }),
    prisma.company.groupBy({ by: ['industryId'], _count: { _all: true } }),
  ]);

  // Real per-industry company counts (unfiltered) for the showcase + sidebar.
  const countByIndustry = new Map<number, number>();
  for (const r of industryCounts) {
    if (r.industryId !== null) countByIndustry.set(r.industryId, r._count._all);
  }

  // Open-role counts for the visible page, one grouped query (no N+1).
  const ids = rows.map((r) => r.id);
  const openCounts = ids.length
    ? await prisma.job.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids }, status: 'ACTIVE' },
        _count: { _all: true },
      })
    : [];
  const openByCompany = new Map<number, number>();
  for (const r of openCounts) openByCompany.set(r.companyId, r._count._all);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Over-range page (crafted or stale/shared URL): redirect to the last real
  // page rather than render an empty grid beneath a positive company count.
  if (page > totalPages) {
    const overflowQs = buildDirectoryQuery({ category, sort, hiring, page: totalPages });
    redirect(overflowQs ? `/companies?${overflowQs}` : '/companies');
  }

  // Only surface industries that actually have companies (no dead filters).
  const withCounts = industriesRaw
    .map((i) => ({ slug: i.slug, name: i.name, count: countByIndustry.get(i.id) ?? 0 }))
    .filter((i) => i.count > 0);
  const showcaseItems: IndustryShowcaseItem[] = [...withCounts].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const sidebarIndustries = [...withCounts].sort((a, b) => a.name.localeCompare(b.name));

  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Companies', url: `${SITE}/companies` },
  ]);

  const filtersEl = (
    <CompanyFilters
      industries={sidebarIndustries}
      activeCategory={category}
      activeSort={sort}
      hiring={hiring}
    />
  );
  const sheetFiltersEl = (
    <CompanyFilters
      industries={sidebarIndustries}
      activeCategory={category}
      activeSort={sort}
      hiring={hiring}
      showTitle={false}
    />
  );

  const countLabel = `${total.toLocaleString('en-IN')} ${total === 1 ? 'company' : 'companies'}${
    filterIndustry ? ` in ${filterIndustry.name}` : ''
  }${hiring ? ' hiring now' : ''}`;

  return (
    <SiteShell>
      <JsonLd value={bc} />

      {/* Page header band */}
      <section className="border-b border-[var(--color-border)]">
        <Container className="py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-3 text-xs text-[var(--color-fg-muted)]">
            <Link href="/" className="transition-colors hover:text-[var(--color-fg)]">
              Home
            </Link>
            <span className="px-1.5 text-[var(--color-fg-subtle)]">/</span>
            <span className="text-[var(--color-fg)]">Companies</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            Explore companies hiring in India
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {total === 0 ? (
              'No companies match this filter.'
            ) : (
              <>
                <span className="font-semibold text-[var(--color-fg)]">{countLabel}</span> — discover
                employers, their open roles, and real ratings.
              </>
            )}
          </p>
        </Container>
      </section>

      <Container className="py-8">
        {/* Browse-by-industry showcase (the section below the count) */}
        {showcaseItems.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Explore by industry</h2>
            </div>
            <IndustryShowcase items={showcaseItems} activeSlug={category} />
          </div>
        )}

        {/* Filters (left) + results grid */}
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-20">{filtersEl}</div>
          </aside>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-fg-muted)]">
                <span className="font-semibold text-[var(--color-fg)]">
                  {total.toLocaleString('en-IN')}
                </span>{' '}
                {total === 1 ? 'company' : 'companies'}
                {filterIndustry ? ` · ${filterIndustry.name}` : ''}
              </p>
              <div className="lg:hidden">
                <MobileFilterSheet>{sheetFiltersEl}</MobileFilterSheet>
              </div>
            </div>

            <h2 className="sr-only">Companies</h2>
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center">
                <p className="text-sm font-medium text-[var(--color-fg)]">No companies match</p>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  Try a different industry or clear the filters.
                </p>
                <Link
                  href="/companies"
                  className="mt-4 inline-block text-sm font-medium text-[var(--color-accent-700)] hover:underline"
                >
                  Clear filters
                </Link>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rows.map((c) => (
                  <li key={c.id}>
                    <CompanyCard
                      id={c.id}
                      name={c.name}
                      slug={c.slug}
                      logoUrl={c.logoUrl}
                      industryName={c.industry?.name ?? null}
                      hqCityName={c.headquartersCity?.name ?? null}
                      averageRating={c.averageRating}
                      reviewCount={c.reviewCount}
                      openingsCount={openByCompany.get(c.id) ?? 0}
                    />
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-8 flex items-center justify-between text-sm"
              >
                <PageLink
                  page={page - 1}
                  disabled={page <= 1}
                  category={category}
                  sort={sort}
                  hiring={hiring}
                >
                  ← Previous
                </PageLink>
                <span className="text-[var(--color-fg-muted)]">
                  Page {page} of {totalPages}
                </span>
                <PageLink
                  page={page + 1}
                  disabled={page >= totalPages}
                  category={category}
                  sort={sort}
                  hiring={hiring}
                >
                  Next →
                </PageLink>
              </nav>
            )}
          </div>
        </div>
      </Container>
    </SiteShell>
  );
}

function PageLink({
  page,
  disabled,
  category,
  sort,
  hiring,
  children,
}: {
  page: number;
  disabled: boolean;
  category: string | null;
  sort: DirectorySort;
  hiring: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  }
  const qs = buildDirectoryQuery({ category, sort, hiring, page });
  return (
    <Link
      href={qs ? `/companies?${qs}` : '/companies'}
      className="font-medium text-[var(--color-fg)] transition-colors hover:text-[var(--color-primary-700)]"
    >
      {children}
    </Link>
  );
}
