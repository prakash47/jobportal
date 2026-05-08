import { prisma } from '@jobportal/db';
import { ArticleCard } from './ArticleCard';

const RELATED_COUNT = 3;

export async function RelatedArticles({
  currentSlug,
  tags,
}: {
  currentSlug: string;
  tags: string[];
}) {
  // Prefer articles sharing at least one tag; fall back to newest published
  // when there's no overlap (or the article has no tags). One query each
  // way — the fallback only fires when the first returns < RELATED_COUNT.
  const tagged =
    tags.length > 0
      ? await prisma.article.findMany({
          where: {
            slug: { not: currentSlug },
            status: 'PUBLISHED',
            tags: { hasSome: tags },
          },
          orderBy: { publishedAt: 'desc' },
          take: RELATED_COUNT,
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
        })
      : [];

  let results = tagged;
  if (results.length < RELATED_COUNT) {
    const fillerNeeded = RELATED_COUNT - results.length;
    const seenSlugs = new Set<string>([currentSlug, ...results.map((r) => r.slug)]);
    const filler = await prisma.article.findMany({
      where: {
        slug: { notIn: [...seenSlugs] },
        status: 'PUBLISHED',
      },
      orderBy: { publishedAt: 'desc' },
      take: fillerNeeded,
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
    });
    results = [...results, ...filler];
  }

  if (results.length === 0) return null;

  return (
    <section className="space-y-4 border-t border-[var(--color-border)] pt-8" aria-label="Related articles">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--color-fg)]">
        Keep reading
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <ArticleCard
            key={r.slug}
            slug={r.slug}
            title={r.title}
            excerpt={r.excerpt}
            authorName={r.authorName}
            publishedAt={r.publishedAt}
            readTimeMinutes={r.readTimeMinutes}
            tags={r.tags}
            coverImageUrl={r.coverImageUrl}
          />
        ))}
      </div>
    </section>
  );
}
