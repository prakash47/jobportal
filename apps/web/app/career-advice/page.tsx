import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@jobportal/db';
import { ArticleCard, TagFilter } from '../../components/career-advice';
import { JsonLd, breadcrumbList } from '../../lib/seo';
import { parseArticleIndexParams } from '../../lib/cms/params';

const PAGE_SIZE = 12;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.8.1 — directory is SSR with edge cache. revalidate=3600 → Next ISR
// sets s-maxage=3600. SWR semantics live in next.config.ts headers (1h + 6h
// SWR per spec).
export const revalidate = 3600;

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
  const { tag, page } = parseArticleIndexParams(sp);

  const where: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };
  if (tag) where.tags = { has: tag };

  const [articles, total, allPublished] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        authorName: true,
        publishedAt: true,
        readTimeMinutes: true,
        tags: true,
        coverImageUrl: true,
      },
    }),
    prisma.article.count({ where }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: { tags: true },
    }),
  ]);

  // Build the tag list with counts so the filter row can render "Resume 4".
  // Aggregating in JS is fine at MVP scale (3 articles seeded; even at
  // hundreds the row materialises cheaply).
  const counts = new Map<string, number>();
  for (const a of allPublished) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tagList = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({
      slug,
      label: slug.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = tag !== null;

  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Career advice', url: `${SITE}/career-advice` },
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <JsonLd value={bc} />

      <header className="mb-8 max-w-[70ch] space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-4xl">
          Career advice
        </h1>
        <p className="text-base leading-relaxed text-[var(--color-fg-muted)]">
          Practical writing on resumes, interviews, salary, and getting hired. From the
          JobPortal editorial team.
        </p>
      </header>

      {tagList.length > 0 && (
        <div className="mb-8">
          <TagFilter tags={tagList} />
        </div>
      )}

      {articles.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {filtered ? 'Nothing matches this tag yet' : 'No articles yet'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {filtered ? 'Try a different tag, or clear the filter.' : 'Check back soon.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
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
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} tag={tag}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} tag={tag}>
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
  tag,
  children,
}: {
  page: number;
  disabled: boolean;
  tag: string | null;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (tag) params.set('tag', tag);
  return (
    <Link
      href={`/career-advice?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
