import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    company: { findMany: vi.fn() },
    article: { findMany: vi.fn() },
    city: { findMany: vi.fn() },
    skill: { findMany: vi.fn() },
    job: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@jobportal/db';
import {
  getArticleUrls,
  getCompanyUrls,
  getJobShard,
  getJobShardCount,
  getLandingUrls,
  getStaticUrls,
  JOBS_PER_SHARD,
  SHARD_ARTICLES,
  SHARD_COMPANIES,
  SHARD_JOBS_BASE,
  SHARD_LANDINGS,
  SHARD_STATIC,
} from './sitemap-shards';

const mocked = prisma as unknown as {
  company: { findMany: ReturnType<typeof vi.fn> };
  article: { findMany: ReturnType<typeof vi.fn> };
  city: { findMany: ReturnType<typeof vi.fn> };
  skill: { findMany: ReturnType<typeof vi.fn> };
  job: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
};

describe('shard ID constants', () => {
  it('declare a fixed layout: 0=static, 1=companies, 2=articles, 3=landings, 4+=jobs', () => {
    expect(SHARD_STATIC).toBe(0);
    expect(SHARD_COMPANIES).toBe(1);
    expect(SHARD_ARTICLES).toBe(2);
    expect(SHARD_LANDINGS).toBe(3);
    expect(SHARD_JOBS_BASE).toBe(4);
  });
});

describe('getStaticUrls', () => {
  it('includes the four canonical landing pages with descending priority', () => {
    const urls = getStaticUrls();
    expect(urls).toHaveLength(4);
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toEqual(['/', '/jobs', '/companies', '/career-advice']);
    expect(urls[0]?.priority).toBe(1.0);
    expect(urls[1]?.priority).toBe(0.9);
  });
});

describe('getCompanyUrls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('emits both /<slug>-overview-<id> and /working-at-<slug>-<id> for each company', async () => {
    mocked.company.findMany.mockResolvedValue([
      { id: 12, slug: 'acme-corp', updatedAt: new Date('2026-04-01') },
      { id: 33, slug: 'foo-tech', updatedAt: new Date('2026-04-02') },
    ]);
    const urls = await getCompanyUrls();
    expect(urls).toHaveLength(4);
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/acme-corp-overview-12');
    expect(paths).toContain('/working-at-acme-corp-12');
    expect(paths).toContain('/foo-tech-overview-33');
    expect(paths).toContain('/working-at-foo-tech-33');
  });

  it('zero companies → empty list (not an error)', async () => {
    mocked.company.findMany.mockResolvedValue([]);
    expect(await getCompanyUrls()).toEqual([]);
  });
});

describe('getArticleUrls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries PUBLISHED only — DRAFT and ARCHIVED stay out of the sitemap', async () => {
    mocked.article.findMany.mockResolvedValue([
      { slug: 'how-to-write-a-resume', updatedAt: new Date('2026-03-15') },
    ]);
    await getArticleUrls();
    const args = mocked.article.findMany.mock.calls[0]?.[0] as {
      where: { status: string };
    };
    expect(args.where).toEqual({ status: 'PUBLISHED' });
  });

  it('emits /career-advice/<slug> with the updatedAt as lastModified', async () => {
    const updatedAt = new Date('2026-03-15');
    mocked.article.findMany.mockResolvedValue([
      { slug: 'how-to-write-a-resume', updatedAt },
    ]);
    const urls = await getArticleUrls();
    expect(urls).toEqual([
      expect.objectContaining({
        lastModified: updatedAt,
      }),
    ]);
    expect(new URL(urls[0]!.url).pathname).toBe('/career-advice/how-to-write-a-resume');
  });
});

describe('getLandingUrls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('emits one /jobs-in-<city> per seeded city regardless of inventory', async () => {
    mocked.city.findMany
      // First call (top-level): list of cities for the /jobs-in-X variant.
      .mockResolvedValueOnce([
        { slug: 'bangalore' },
        { slug: 'pune' },
      ])
      // Second call (inside the combo expansion to look up slugs by id).
      .mockResolvedValueOnce([
        { id: 1, slug: 'bangalore' },
        { id: 2, slug: 'pune' },
      ]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
    ]);
    mocked.job.groupBy.mockResolvedValue([]);
    mocked.$queryRaw.mockResolvedValue([]);

    const urls = await getLandingUrls();
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/jobs-in-bangalore');
    expect(paths).toContain('/jobs-in-pune');
  });

  it('emits /<skill>-jobs only for skills that have ≥1 ACTIVE job', async () => {
    mocked.city.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
      { id: 12, slug: 'cobol' }, // no active jobs — should NOT appear
    ]);
    mocked.job.groupBy.mockResolvedValue([
      { skillIds: [10, 11], _count: { _all: 5 } },
    ]);
    mocked.$queryRaw.mockResolvedValue([]);

    const urls = await getLandingUrls();
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/python-jobs');
    expect(paths).toContain('/react-jobs');
    expect(paths).not.toContain('/cobol-jobs');
  });

  it('skill×city combos: only emits pairs with ≥1 ACTIVE job (from $queryRaw)', async () => {
    mocked.city.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, slug: 'bangalore' },
        { id: 2, slug: 'pune' },
      ]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
    ]);
    mocked.job.groupBy.mockResolvedValue([]);
    mocked.$queryRaw.mockResolvedValue([
      { cityId: 1, skillId: 10 }, // python in bangalore — yes
      { cityId: 2, skillId: 11 }, // react in pune — yes
      // python in pune + react in bangalore — NOT present, should NOT appear
    ]);

    const urls = await getLandingUrls();
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/python-jobs-in-bangalore');
    expect(paths).toContain('/react-jobs-in-pune');
    expect(paths).not.toContain('/python-jobs-in-pune');
    expect(paths).not.toContain('/react-jobs-in-bangalore');
  });

  it('orphan cityId/skillId in $queryRaw result is silently dropped (defense)', async () => {
    mocked.city.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, slug: 'bangalore' }]);
    mocked.skill.findMany.mockResolvedValue([{ id: 10, slug: 'python' }]);
    mocked.job.groupBy.mockResolvedValue([]);
    mocked.$queryRaw.mockResolvedValue([
      { cityId: 999, skillId: 10 }, // unknown city — dropped
      { cityId: 1, skillId: 999 }, // unknown skill — dropped
      { cityId: 1, skillId: 10 }, // valid
    ]);

    const urls = await getLandingUrls();
    const combos = urls.filter((u) => u.url.includes('-in-'));
    expect(combos).toHaveLength(1);
  });
});

describe('getJobShardCount', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries ACTIVE jobs only', async () => {
    mocked.job.count.mockResolvedValue(0);
    await getJobShardCount();
    expect(mocked.job.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('zero jobs → zero shards', async () => {
    mocked.job.count.mockResolvedValue(0);
    expect(await getJobShardCount()).toBe(0);
  });

  it('1 job → 1 shard', async () => {
    mocked.job.count.mockResolvedValue(1);
    expect(await getJobShardCount()).toBe(1);
  });

  it('exactly JOBS_PER_SHARD → 1 shard', async () => {
    mocked.job.count.mockResolvedValue(JOBS_PER_SHARD);
    expect(await getJobShardCount()).toBe(1);
  });

  it('JOBS_PER_SHARD + 1 → 2 shards', async () => {
    mocked.job.count.mockResolvedValue(JOBS_PER_SHARD + 1);
    expect(await getJobShardCount()).toBe(2);
  });

  it('100k jobs → 3 shards (ceil)', async () => {
    mocked.job.count.mockResolvedValue(100_000);
    expect(await getJobShardCount()).toBe(3);
  });
});

describe('getJobShard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shard 0 → skip 0, take JOBS_PER_SHARD; ACTIVE only', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(0);
    const args = mocked.job.findMany.mock.calls[0]?.[0] as {
      where: { status: string };
      skip: number;
      take: number;
    };
    expect(args.where).toEqual({ status: 'ACTIVE' });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(JOBS_PER_SHARD);
  });

  it('shard 2 → skip 2 * JOBS_PER_SHARD', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(2);
    const args = mocked.job.findMany.mock.calls[0]?.[0] as { skip: number };
    expect(args.skip).toBe(2 * JOBS_PER_SHARD);
  });

  it('emits /job/<canonicalSlug> with the row updatedAt as lastModified', async () => {
    const updatedAt = new Date('2026-04-10');
    mocked.job.findMany.mockResolvedValue([
      { canonicalSlug: 'sales-executive-acme-12345', updatedAt },
    ]);
    const urls = await getJobShard(0);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!.url).pathname).toBe('/job/sales-executive-acme-12345');
    expect(urls[0]!.lastModified).toBe(updatedAt);
  });
});
