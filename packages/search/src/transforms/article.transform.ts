import type { ArticleDoc } from '../types';

export type ArticleInput = {
  id: number;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  authorName: string;
  status: string;
  publishedAt: Date | null;
};

export function articleToDoc(article: ArticleInput): ArticleDoc {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    body: article.body,
    excerpt: article.excerpt,
    authorName: article.authorName,
    status: article.status,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    title_suggest: { input: [article.title] },
  };
}
