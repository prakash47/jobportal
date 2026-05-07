import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, Prisma } from '@jobportal/db';
import { CompanyCard, IndustryFilter } from '../../components/companies';
import { parseDirectoryParams } from '../../lib/companies/params';
import { JsonLd } from '../../lib/seo';
import { breadcrumbList } from '../../lib/seo/json-ld';

const PAGE_SIZE = 24;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.7.1 — directory is SSR with edge TTL 1h + SWR 6h. The explicit
// Cache-Control lives in next.config.ts headers; revalidate=3600 keeps the
// Vercel ISR cache in sync.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Companies — JobPortal',
  description: 'Browse companies hiring in India. Filter by industry, see open roles and ratings.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompaniesDirectoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { category, page } = parseDirectoryParams(sp);

  // Resolve filter to industryId via the slug catalog. An unknown slug yields
  // an empty result rather than a 404 — keeps the URL forgiving.
  const industries = await prisma.industry.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: 'asc' },
  });
  const filterIndustry = category ? industries.find((i) => i.slug === category) : null;

  const where: Prisma.CompanyWhereInput = {};
  if (filterIndustry) where.industryId = filterIndustry.id;

  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ averageRating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
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
  ]);

  // Fetch open-role counts in one query keyed by companyId (avoids N+1).
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

  // SRS §4.7.1 — BreadcrumbList JSON-LD on the directory.
  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Companies', url: `${SITE}/companies` },
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd value={bc} />

      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
          Companies
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {total === 0
            ? 'No companies match this filter.'
            : `${total.toLocaleString('en-IN')} ${total === 1 ? 'company' : 'companies'} hiring${
                filterIndustry ? ` in ${filterIndustry.name}` : ''
              }.`}
        </p>
      </header>

      <div className="mb-6">
        <IndustryFilter industries={industries.map((i) => ({ slug: i.slug, name: i.name }))} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">Nothing matches</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Try a different industry or clear the filter.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} category={category}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} category={category}>
            Older →
          </PageLink>
        </nav>
      )}
    </main>
  );
}

function PageLink({
  page,
  disabled,
  category,
  children,
}: {
  page: number;
  disabled: boolean;
  category: string | null;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  }
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (category) params.set('category', category);
  return (
    <Link
      href={`/companies?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
