import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: { article: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() } },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { PublicArticlesService } from './public-articles.service';
import { ListArticlesQueryDto } from './dto';

const db = prisma as unknown as {
  article: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const svc = new PublicArticlesService();
const base = { tag: null, q: null, page: 1 };

const article = {
  id: 1,
  slug: 'how-to-write-a-resume',
  title: 'How to write a resume',
  body: '## Heading\n\nSome **markdown**.',
  excerpt: 'e',
  authorName: 'Asha Rao',
  status: 'PUBLISHED',
  publishedAt: new Date('2026-07-14T09:00:00Z'),
  readTimeMinutes: 6,
  tags: ['resume'],
  faqs: null,
  coverImageUrl: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-20T12:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.article.findMany.mockResolvedValue([]);
  db.article.count.mockResolvedValue(0);
  db.article.findUnique.mockResolvedValue(article);
});

describe('ListArticlesQueryDto', () => {
  it('rejects unknown params, including any attempt to ask for a status', () => {
    expect(ListArticlesQueryDto.safeParse({ status: 'DRAFT' }).success).toBe(false);
    expect(ListArticlesQueryDto.safeParse({ nope: '1' }).success).toBe(false);
  });

  it('accepts the website\'s own params', () => {
    expect(ListArticlesQueryDto.safeParse({ tag: 'salary', q: 'resume', page: '2' }).success).toBe(true);
  });
});

describe('list', () => {
  it('PINS status to PUBLISHED — no query param can surface a draft', async () => {
    await svc.list(base);
    expect(db.article.findMany.mock.calls[0]![0].where).toEqual({ status: 'PUBLISHED' });
  });

  it('keeps the PUBLISHED gate alongside a tag filter', async () => {
    await svc.list({ ...base, tag: 'salary' });
    expect(db.article.findMany.mock.calls[0]![0].where).toEqual({
      status: 'PUBLISHED',
      tags: { has: 'salary' },
    });
  });

  it('searches title and excerpt case-insensitively, still PUBLISHED-only', async () => {
    await svc.list({ ...base, q: 'resume' });
    expect(db.article.findMany.mock.calls[0]![0].where).toEqual({
      status: 'PUBLISHED',
      OR: [
        { title: { contains: 'resume', mode: 'insensitive' } },
        { excerpt: { contains: 'resume', mode: 'insensitive' } },
      ],
    });
  });

  it('counts with the SAME where as the page', async () => {
    await svc.list({ ...base, q: 'x', tag: 'y' });
    expect(db.article.count.mock.calls[0]![0].where).toEqual(
      db.article.findMany.mock.calls[0]![0].where,
    );
  });

  it('orders newest first with an id tiebreaker — publishedAt is NULLABLE', async () => {
    // With a nullable sort key, `id` is not a nicety: it is what keeps offset
    // pagination deterministic across pages at all.
    await svc.list(base);
    expect(db.article.findMany.mock.calls[0]![0].orderBy).toEqual([
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('projects only the index fields — never the body', async () => {
    await svc.list(base);
    const select = db.article.findMany.mock.calls[0]![0].select;
    expect(select.body).toBeUndefined();
    expect(select.status).toBeUndefined();
    expect(Object.keys(select).sort()).toEqual(
      ['authorName', 'coverImageUrl', 'excerpt', 'publishedAt', 'readTimeMinutes', 'slug', 'tags', 'title'],
    );
  });

  it('page size is 20 — the API value, not the website index\'s 12', async () => {
    const out = await svc.list({ ...base, page: 3 });
    expect(out.pageSize).toBe(20);
    expect(db.article.findMany.mock.calls[0]![0].skip).toBe(40);
    expect(out.page).toBe(3);
  });

  it('serializes publishedAt as ISO, and null stays null', async () => {
    db.article.findMany.mockResolvedValue([
      { ...article, publishedAt: new Date('2026-07-14T09:00:00Z') },
      { ...article, slug: 'other', publishedAt: null },
    ]);
    db.article.count.mockResolvedValue(2);
    const out = await svc.list(base);
    expect(out.hits[0]!.publishedAt).toBe('2026-07-14T09:00:00.000Z');
    expect(out.hits[1]!.publishedAt).toBeNull();
  });
});

describe('detail', () => {
  it('404s an unknown slug', async () => {
    db.article.findUnique.mockResolvedValue(null);
    await expect(svc.detail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a DRAFT — byte-identical to a slug that does not exist', async () => {
    db.article.findUnique.mockResolvedValue({ ...article, status: 'DRAFT' });
    const drafted = await svc.detail('how-to-write-a-resume').catch((e: Error) => e.message);
    db.article.findUnique.mockResolvedValue(null);
    const missing = await svc.detail('nope').catch((e: Error) => e.message);
    expect(drafted).toBe(missing);
  });

  it('404s an ARCHIVED article too — only PUBLISHED is readable', async () => {
    db.article.findUnique.mockResolvedValue({ ...article, status: 'ARCHIVED' });
    await expect(svc.detail('how-to-write-a-resume')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns RAW MARKDOWN, never rendered HTML (owner decision, ADR 0002 §3)', async () => {
    const out = await svc.detail('how-to-write-a-resume');
    expect(out.body).toBe('## Heading\n\nSome **markdown**.');
    // If this ever starts returning HTML, the app renders markdown and would
    // show the tags as literal text.
    expect(out.body).not.toContain('<h2>');
    expect(out).not.toHaveProperty('bodyHtml');
  });

  it('never leaks the status column', async () => {
    const out = await svc.detail('how-to-write-a-resume');
    expect(out).not.toHaveProperty('status');
  });

  it('narrows a malformed faqs Json to [] rather than passing it through', async () => {
    db.article.findUnique.mockResolvedValue({
      ...article,
      faqs: [
        { question: 'Q', answer: 'A' },
        { question: 'no answer' },
        { answer: 'no question' },
        'nonsense',
        null,
        { question: 1, answer: 2 },
      ],
    });
    const out = await svc.detail('how-to-write-a-resume');
    expect(out.faqs).toEqual([{ question: 'Q', answer: 'A' }]);
  });

  it('turns a null or non-array faqs column into an empty array', async () => {
    expect((await svc.detail('how-to-write-a-resume')).faqs).toEqual([]);
    db.article.findUnique.mockResolvedValue({ ...article, faqs: { not: 'an array' } });
    expect((await svc.detail('how-to-write-a-resume')).faqs).toEqual([]);
  });

  it('serializes both dates as ISO strings', async () => {
    const out = await svc.detail('how-to-write-a-resume');
    expect(out.publishedAt).toBe('2026-07-14T09:00:00.000Z');
    expect(out.updatedAt).toBe('2026-07-20T12:00:00.000Z');
  });
});
