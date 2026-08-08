import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@jobportal/db';
import type { ArticleIndexParams } from '@jobportal/domain/article-params';

/**
 * 20, matching every other API list endpoint (owner decision, ADR 0002 §4).
 * The website's career-advice index uses 12 to suit its editorial grid — a
 * recorded divergence, not an oversight.
 */
export const PAGE_SIZE = 20;

export interface ArticleListItem {
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: string | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface ArticleDetail extends ArticleListItem {
  id: number;
  /**
   * RAW MARKDOWN, not rendered HTML — owner decision, ADR 0002 §3.
   *
   * The mobile spec asked for a sanitized `bodyHtml`. Producing it here would
   * mean pulling the website's unified/Shiki pipeline into the API: seven
   * ESM-only packages into a CommonJS Nest build, ~12 MB of grammars, and a
   * seconds-long cold start. The Flutter side already has a markdown renderer,
   * so the whole cost disappears by shipping the source.
   *
   * The trade-off, stated: sanitisation moves to the client, so the app must
   * render this as MARKDOWN and never as HTML. Syntax highlighting is lost on
   * mobile. `apps/web` keeps its own pipeline, untouched.
   */
  body: string;
  faqs: FaqEntry[];
  updatedAt: string;
}

/** The exact fields the SSR index projects — no more. */
const LIST_SELECT = {
  slug: true,
  title: true,
  excerpt: true,
  authorName: true,
  publishedAt: true,
  readTimeMinutes: true,
  tags: true,
  coverImageUrl: true,
} as const;

/**
 * `Article.faqs` is a loose `Json?` column. Same guard the SSR detail page
 * applies: anything that is not an array of `{question, answer}` strings
 * becomes `[]` rather than reaching the client as malformed shapes.
 */
function parseFaqs(v: unknown): FaqEntry[] {
  if (!Array.isArray(v)) return [];
  const out: FaqEntry[] = [];
  for (const e of v) {
    if (typeof e !== 'object' || e === null) continue;
    const rec = e as Record<string, unknown>;
    if (typeof rec['question'] === 'string' && typeof rec['answer'] === 'string') {
      out.push({ question: rec['question'], answer: rec['answer'] });
    }
  }
  return out;
}

@Injectable()
export class PublicArticlesService {
  /**
   * Published articles, newest first.
   *
   * The PUBLISHED gate is not optional and not inherited from the parser —
   * it is pinned in the where clause here, so no combination of query params
   * can surface a draft.
   */
  async list(params: ArticleIndexParams): Promise<{
    hits: ArticleListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };
    if (params.tag) where.tags = { has: params.tag };
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { excerpt: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.article.findMany({
        where,
        select: LIST_SELECT,
        // publishedAt is nullable, so `id` is not just a tiebreaker for equal
        // timestamps — it is what keeps offset pagination deterministic at all.
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.article.count({ where }),
    ]);

    return {
      hits: rows.map((a) => ({
        ...a,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
      })),
      total,
      page: params.page,
      pageSize: PAGE_SIZE,
    };
  }

  async detail(slug: string): Promise<ArticleDetail> {
    const article = await prisma.article.findUnique({ where: { slug } });
    // A DRAFT or archived article is a 404, byte-identical to a slug that does
    // not exist — the same rule the SSR page applies, so nothing confirms an
    // unpublished draft is sitting there.
    if (!article || article.status !== 'PUBLISHED') {
      throw new NotFoundException('Article not found');
    }

    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      body: article.body,
      excerpt: article.excerpt,
      authorName: article.authorName,
      publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
      readTimeMinutes: article.readTimeMinutes,
      tags: article.tags,
      faqs: parseFaqs(article.faqs),
      coverImageUrl: article.coverImageUrl,
      updatedAt: article.updatedAt.toISOString(),
    };
  }
}
