import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import {
  ArticleBody,
  ArticleFAQ,
  ArticleHero,
  RelatedArticles,
  type FaqEntry,
} from '../../../components/career-advice';
import { renderArticleMarkdown } from '../../../lib/cms/markdown';
import { JsonLd, article as articleLd, breadcrumbList, faqPage } from '../../../lib/seo';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const STATIC_PARAMS_LIMIT = 50;

// SRS §4.8.2 — SSG via generateStaticParams (top 50 PUBLISHED articles by
// publishedAt DESC) + revalidate as a safety net. On-demand revalidation
// arrives via POST /api/revalidate/article — admin authoring tool (Task 19)
// calls it on publish/edit/archive.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function isFaqArray(v: unknown): v is FaqEntry[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>)['question'] === 'string' &&
        typeof (e as Record<string, unknown>)['answer'] === 'string',
    )
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: STATIC_PARAMS_LIMIT,
    select: { slug: true },
  });
  return articles.map((a) => ({ slug: a.slug }));
}

async function loadArticle(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      excerpt: true,
      authorName: true,
      status: true,
      publishedAt: true,
      readTimeMinutes: true,
      tags: true,
      faqs: true,
      coverImageUrl: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadArticle(slug);
  if (!a || a.status !== 'PUBLISHED') return { title: 'Page not found — JobPortal' };

  const title = `${a.title} — JobPortal`;
  const description =
    a.excerpt?.slice(0, 160) ?? a.body.replace(/\s+/g, ' ').slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/career-advice/${a.slug}` },
  };
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const a = await loadArticle(slug);
  // Drafts and archived articles produce 404 to anonymous readers; the admin
  // preview path lands later with the authoring tool (Task 19).
  if (!a || a.status !== 'PUBLISHED') notFound();

  const html = await renderArticleMarkdown(a.body);
  const faqs: FaqEntry[] = isFaqArray(a.faqs) ? a.faqs : [];

  const canonicalUrl = `${SITE}/career-advice/${a.slug}`;

  // SRS §4.8.4 — Article + BreadcrumbList + (optional) FAQPage JSON-LD.
  const articleJsonLd = articleLd({
    headline: a.title,
    datePublished: (a.publishedAt ?? a.updatedAt).toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: { name: a.authorName },
    ...(a.coverImageUrl ? { image: a.coverImageUrl } : {}),
    ...(a.excerpt ? { description: a.excerpt } : {}),
  });
  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Career advice', url: `${SITE}/career-advice` },
    { name: a.title, url: canonicalUrl },
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <JsonLd value={articleJsonLd} />
      <JsonLd value={bc} />
      {faqs.length > 0 && <JsonLd value={faqPage(faqs)} />}

      <ArticleHero
        title={a.title}
        excerpt={a.excerpt}
        authorName={a.authorName}
        publishedAt={a.publishedAt}
        readTimeMinutes={a.readTimeMinutes}
        tags={a.tags}
        coverImageUrl={a.coverImageUrl}
      />

      <div className="mt-10">
        <ArticleBody html={html} />
      </div>

      {faqs.length > 0 && (
        <div className="mt-12">
          <ArticleFAQ faqs={faqs} />
        </div>
      )}

      <div className="mt-12">
        <RelatedArticles currentSlug={a.slug} tags={a.tags} />
      </div>
    </main>
  );
}
