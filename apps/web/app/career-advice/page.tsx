import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@jobportal/db';
import { Container } from '@jobportal/ui';
import {
  CareerColophon,
  CareerMasthead,
  CoverTile,
  type ColophonArchiveItem,
  type MastheadTopic,
} from '../../components/career-advice';
import { tagLabel } from '../../components/career-advice/article-format';
import { SiteShell } from '../../components/shell/SiteShell';
import { JsonLd, breadcrumbList } from '../../lib/seo';
import { parseArticleIndexParams } from '../../lib/cms/params';

const PAGE_SIZE = 12;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.8.1 — SiteShell (server-side auth) makes the route dynamic (no ISR
// revalidate); BreadcrumbList JSON-LD + self-canonical still render server-side.

export const metadata: Metadata = {
  title: 'Career advice — JobPortal',
  description:
    'Practical writing on resumes, interviews, salary, and getting hired. From the JobPortal editorial team.',
  alternates: { canonical: `${SITE}/career-advice` },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ARTICLE_SELECT = {
  slug: true,
  title: true,
  excerpt: true,
  authorName: true,
  publishedAt: true,
  readTimeMinutes: true,
  tags: true,
  coverImageUrl: true,
} satisfies Prisma.ArticleSelect;

export default async function CareerAdviceIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { tag, q, page } = parseArticleIndexParams(sp);

  const where: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };
  if (tag) where.tags = { has: tag };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { excerpt: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [articles, total, allPublished, recent] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: ARTICLE_SELECT,
    }),
    prisma.article.count({ where }),
    prisma.article.findMany({ where: { status: 'PUBLISHED' }, select: { tags: true } }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { slug: true, title: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const a of allPublished) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topics: MastheadTopic[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({ slug, count }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isDefaultView = !q && !tag && page === 1;
  const showFeatured = isDefaultView && articles.length > 0;
  const featured = showFeatured ? articles[0] : null;
  const gridArticles = showFeatured ? articles.slice(1) : articles;

  const shownSlugs = new Set(articles.map((a) => a.slug));
  const archive: ColophonArchiveItem[] = recent
    .filter((r) => !shownSlugs.has(r.slug))
    .slice(0, 4)
    .map((r) => ({ slug: r.slug, title: r.title }));

  const sectionTitle = q ? `Results for “${q}”` : tag ? tagLabel(tag) : 'More from the desk';
  const sectionCount = q || tag ? total : null;
  const showGridSection = gridArticles.length > 0 || !featured;

  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Career advice', url: `${SITE}/career-advice` },
  ]);

  return (
    <SiteShell>
      <JsonLd value={bc} />
      <Container size="lg" className="space-y-12 py-10 lg:space-y-14 lg:py-14">
        <CareerMasthead topics={topics} activeTag={tag} query={q} initialQuery={q ?? ''} />

        {featured && (
          <CoverTile article={featured} size="cover" headingLevel={2} />
        )}

        {showGridSection && (
          <section aria-label={sectionTitle}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-border)] pb-4">
              <h2 className="font-editorial text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
                {sectionTitle}
              </h2>
              {sectionCount !== null && (
                <span className="text-sm text-[var(--color-fg-muted)]">
                  {sectionCount} {sectionCount === 1 ? 'article' : 'articles'}
                </span>
              )}
            </div>

            {gridArticles.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center">
                {q || tag ? (
                  <>
                    <p className="text-sm font-medium text-[var(--color-fg)]">Nothing matches yet</p>
                    <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                      Try a different search or topic, or{' '}
                      <Link href="/career-advice" className="text-[var(--color-primary-600)] hover:underline">
                        view all articles
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[var(--color-fg)]">No articles yet</p>
                    <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Check back soon.</p>
                  </>
                )}
              </div>
            ) : (
              <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {gridArticles.map((a) => (
                  <li key={a.slug}>
                    <CoverTile article={a} size="tile" />
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-10 flex items-center justify-between border-t border-[var(--color-border)] pt-6 text-sm"
              >
                <PageLink page={page - 1} disabled={page <= 1} tag={tag} q={q}>
                  ← Newer
                </PageLink>
                <span className="text-[var(--color-fg-muted)]">
                  Page {page} of {totalPages}
                </span>
                <PageLink page={page + 1} disabled={page >= totalPages} tag={tag} q={q}>
                  Older →
                </PageLink>
              </nav>
            )}
          </section>
        )}

        <CareerColophon archive={archive} />
      </Container>
    </SiteShell>
  );
}

function PageLink({
  page,
  disabled,
  tag,
  q,
  children,
}: {
  page: number;
  disabled: boolean;
  tag: string | null;
  q: string | null;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (tag) params.set('tag', tag);
  if (q) params.set('q', q);
  return (
    <Link
      href={`/career-advice?${params.toString()}`}
      className="font-medium text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
