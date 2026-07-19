import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@jobportal/db';
import { Container } from '@jobportal/ui';
import {
  ArticleCard,
  CareerHero,
  CareerSidebar,
  FeaturedArticle,
  TagFilter,
  type SidebarTopic,
} from '../../components/career-advice';
import { tagLabel } from '../../components/career-advice/article-format';
import { SiteShell } from '../../components/shell/SiteShell';
import { JsonLd, breadcrumbList } from '../../lib/seo';
import { parseArticleIndexParams } from '../../lib/cms/params';

const PAGE_SIZE = 12;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.8.1 — the directory now carries the shared site chrome (SiteShell reads
// signed-in state server-side), so the route renders dynamically and cannot use
// ISR `revalidate` — the same trade-off /companies + /company adopted. The
// BreadcrumbList JSON-LD + self-canonical still render server-side (SEO intact).

export const metadata: Metadata = {
  title: 'Career advice — JobPortal',
  description:
    'Practical writing on resumes, interviews, salary, and getting hired. From the JobPortal editorial team.',
  alternates: { canonical: `${SITE}/career-advice` },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

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

  const articleSelect = {
    slug: true,
    title: true,
    excerpt: true,
    authorName: true,
    publishedAt: true,
    readTimeMinutes: true,
    tags: true,
    coverImageUrl: true,
  } as const;

  const [articles, total, allPublished, recent] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: articleSelect,
    }),
    prisma.article.count({ where }),
    prisma.article.findMany({ where: { status: 'PUBLISHED' }, select: { tags: true } }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { slug: true, title: true, publishedAt: true },
    }),
  ]);

  // Tag counts across ALL published articles (the topic nav is stable, not
  // scoped to the current filter). JS aggregation is fine at MVP scale.
  const counts = new Map<string, number>();
  for (const a of allPublished) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topics: SidebarTopic[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({ slug, count }));
  const tagListForChips = topics.map((t) => ({ slug: t.slug, label: tagLabel(t.slug), count: t.count }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isDefaultView = !q && !tag && page === 1;
  const showFeatured = isDefaultView && articles.length > 0;
  const featured = showFeatured ? articles[0] : null;
  const gridArticles = showFeatured ? articles.slice(1) : articles;

  const sectionTitle = q
    ? `Results for “${q}”`
    : tag
      ? tagLabel(tag)
      : 'Latest articles';

  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Career advice', url: `${SITE}/career-advice` },
  ]);

  return (
    <SiteShell>
      <JsonLd value={bc} />
      <Container size="lg" className="py-8 lg:py-10">
        <CareerHero initialQuery={q ?? ''} />

        {featured && (
          <div className="mt-8">
            <FeaturedArticle
              slug={featured.slug}
              title={featured.title}
              excerpt={featured.excerpt}
              authorName={featured.authorName}
              publishedAt={featured.publishedAt}
              readTimeMinutes={featured.readTimeMinutes}
              tags={featured.tags}
              coverImageUrl={featured.coverImageUrl}
            />
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-label={sectionTitle} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold text-[var(--color-fg)]">{sectionTitle}</h2>
              <span className="text-sm text-[var(--color-fg-muted)]">
                {total} {total === 1 ? 'article' : 'articles'}
              </span>
            </div>

            {/* Topic chips — the mobile/tablet topic nav (the sidebar owns it on
                desktop). */}
            {tagListForChips.length > 0 && (
              <div className="mt-4 lg:hidden">
                <TagFilter tags={tagListForChips} />
              </div>
            )}

            {gridArticles.length === 0 && !featured ? (
              <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center">
                <p className="text-sm font-medium text-[var(--color-fg)]">
                  {q || tag ? 'Nothing matches yet' : 'No articles yet'}
                </p>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {q || tag ? (
                    <>
                      Try a different search or topic, or{' '}
                      <Link href="/career-advice" className="text-[var(--color-primary-600)] hover:underline">
                        view all articles
                      </Link>
                      .
                    </>
                  ) : (
                    'Check back soon.'
                  )}
                </p>
              </div>
            ) : (
              <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {gridArticles.map((a) => (
                  <li key={a.slug}>
                    <ArticleCard
                      slug={a.slug}
                      title={a.title}
                      excerpt={a.excerpt}
                      authorName={a.authorName}
                      publishedAt={a.publishedAt}
                      readTimeMinutes={a.readTimeMinutes}
                      tags={a.tags}
                      coverImageUrl={a.coverImageUrl}
                    />
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

          <aside className="hidden lg:block" aria-label="Topics and recent articles">
            <div className="lg:sticky lg:top-20">
              <CareerSidebar topics={topics} recent={recent} activeTag={tag} query={q} />
            </div>
          </aside>
        </div>
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
