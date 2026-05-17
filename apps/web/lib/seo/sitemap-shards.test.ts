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
      aggregate: vi.fn(),
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
    aggregate: ReturnType<typeof vi.fn>;
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

  it('emits both /company/<slug>-overview-<id> and /working-at-<slug>-<id> for each company', async () => {
    // PR #33 moved company overview from /<slug>-overview-<id> to
    // /company/<slug>-overview-<id> (Next 16 per-dir slug-uniqueness rule).
    // The helper at sitemap-shards.ts:49 emits the new path; the test was
    // missed in the move. Working-at page kept its root-level path.
    mocked.company.findMany.mockResolvedValue([
      { id: 12, slug: 'acme-corp', updatedAt: new Date('2026-04-01') },
      { id: 33, slug: 'foo-tech', updatedAt: new Date('2026-04-02') },
    ]);
    const urls = await getCompanyUrls();
    expect(urls).toHaveLength(4);
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/company/acme-corp-overview-12');
    expect(paths).toContain('/working-at-acme-corp-12');
    expect(paths).toContain('/company/foo-tech-overview-33');
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
    mocked.city.findMany.mockResolvedValue([
      { id: 1, slug: 'bangalore' },
      { id: 2, slug: 'pune' },
    ]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
    ]);
    // First $queryRaw call: distinct active skill ids.
    // Second $queryRaw call: active (city, skill) pairs.
    mocked.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const urls = await getLandingUrls();
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/jobs-in-bangalore');
    expect(paths).toContain('/jobs-in-pune');
  });

  it('emits /<skill>-jobs only for skills that have ≥1 ACTIVE job', async () => {
    mocked.city.findMany.mockResolvedValue([]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
      { id: 12, slug: 'cobol' }, // no active jobs — should NOT appear
    ]);
    mocked.$queryRaw
      // distinct active skill ids
      .mockResolvedValueOnce([{ skillId: 10 }, { skillId: 11 }])
      // combo pairs (empty)
      .mockResolvedValueOnce([]);

    const urls = await getLandingUrls();
    const paths = urls.map((u) => new URL(u.url).pathname);
    expect(paths).toContain('/python-jobs');
    expect(paths).toContain('/react-jobs');
    expect(paths).not.toContain('/cobol-jobs');
  });

  // SKIPPED — PR #33 archived the /[skill]-jobs-in-[city] route (Next 16
  // Turbopack quirk) and commented out the combo block in sitemap-shards.ts.
  // These tests still assert the old emit-combos behaviour. Restore when
  // PROGRESS.md follow-up chip #6 lands (route catch-all refactor).
  it.skip('skill×city combos: only emits pairs with ≥1 ACTIVE job (from $queryRaw)', async () => {
    mocked.city.findMany.mockResolvedValue([
      { id: 1, slug: 'bangalore' },
      { id: 2, slug: 'pune' },
    ]);
    mocked.skill.findMany.mockResolvedValue([
      { id: 10, slug: 'python' },
      { id: 11, slug: 'react' },
    ]);
    mocked.$queryRaw
      // distinct active skill ids
      .mockResolvedValueOnce([{ skillId: 10 }, { skillId: 11 }])
      // active (city, skill) pairs
      .mockResolvedValueOnce([
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

  // SKIPPED — see comment on the preceding combo test. Restore when chip #6 lands.
  it.skip('orphan cityId/skillId in $queryRaw result is silently dropped (defense)', async () => {
    mocked.city.findMany.mockResolvedValue([{ id: 1, slug: 'bangalore' }]);
    mocked.skill.findMany.mockResolvedValue([{ id: 10, slug: 'python' }]);
    mocked.$queryRaw
      .mockResolvedValueOnce([{ skillId: 10 }])
      .mockResolvedValueOnce([
        { cityId: 999, skillId: 10 }, // unknown city — dropped
        { cityId: 1, skillId: 999 }, // unknown skill — dropped
        { cityId: 1, skillId: 10 }, // valid
      ]);

    const urls = await getLandingUrls();
    // Combo URLs look like /<skill>-jobs-in-<city>; pure /jobs-in-<city>
    // (no skill prefix) also matches "-in-" so filter on -jobs-in- to
    // isolate the combo set.
    const combos = urls.filter((u) => u.url.includes('-jobs-in-'));
    expect(combos).toHaveLength(1);
  });

  it('city.findMany is called once (no duplicated query)', async () => {
    mocked.city.findMany.mockResolvedValue([{ id: 1, slug: 'bangalore' }]);
    mocked.skill.findMany.mockResolvedValue([{ id: 10, slug: 'python' }]);
    mocked.$queryRaw.mockResolvedValue([]);

    await getLandingUrls();
    expect(mocked.city.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('getJobShardCount', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries ACTIVE jobs only', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: null } });
    await getJobShardCount();
    expect(mocked.job.aggregate).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      _max: { id: true },
    });
  });

  it('zero jobs (max id null) → zero shards', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: null } });
    expect(await getJobShardCount()).toBe(0);
  });

  it('max id = 1 → 1 shard', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: 1 } });
    expect(await getJobShardCount()).toBe(1);
  });

  it('max id = JOBS_PER_SHARD → 1 shard', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: JOBS_PER_SHARD } });
    expect(await getJobShardCount()).toBe(1);
  });

  it('max id = JOBS_PER_SHARD + 1 → 2 shards', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: JOBS_PER_SHARD + 1 } });
    expect(await getJobShardCount()).toBe(2);
  });

  it('max id = 100k → 3 shards (ceil at 40k per shard)', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: 100_000 } });
    expect(await getJobShardCount()).toBe(3);
  });
});

describe('getJobShard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shard 0 → id range (0, JOBS_PER_SHARD]; ACTIVE only', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(0);
    const args = mocked.job.findMany.mock.calls[0]?.[0] as {
      where: { status: string; id: { gt: number; lte: number } };
    };
    expect(args.where.status).toBe('ACTIVE');
    expect(args.where.id).toEqual({ gt: 0, lte: JOBS_PER_SHARD });
  });

  it('shard 2 → id range (2 * JOBS_PER_SHARD, 3 * JOBS_PER_SHARD]', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(2);
    const args = mocked.job.findMany.mock.calls[0]?.[0] as {
      where: { id: { gt: number; lte: number } };
    };
    expect(args.where.id).toEqual({
      gt: 2 * JOBS_PER_SHARD,
      lte: 3 * JOBS_PER_SHARD,
    });
  });

  it('uses NO offset pagination (skip is not in the where args)', async () => {
    // Regression guard against the original B2 bug: offset pagination
    // can drop or duplicate rows across regenerations when row status
    // flips between ACTIVE and CLOSED. Id-range pagination is stable.
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(0);
    const args = mocked.job.findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it('adjacent shards cover non-overlapping id ranges', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await getJobShard(0);
    await getJobShard(1);
    const s0 = mocked.job.findMany.mock.calls[0]?.[0] as {
      where: { id: { gt: number; lte: number } };
    };
    const s1 = mocked.job.findMany.mock.calls[1]?.[0] as {
      where: { id: { gt: number; lte: number } };
    };
    // s0 covers (0, JOBS_PER_SHARD]; s1 covers (JOBS_PER_SHARD, 2*JOBS_PER_SHARD].
    // The boundary id JOBS_PER_SHARD is in s0 (lte) and excluded from s1 (gt).
    expect(s0.where.id.lte).toBe(s1.where.id.gt);
    expect(s0.where.id.lte).toBeLessThan(s1.where.id.lte);
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

// Integration test for app/sitemap.ts default export. Catches the Next 16
// signature regression (id is Promise<string>, not number): if anyone
// forgets to await it, the switch statement falls through to default
// silently and every shard payload becomes wrong.
describe('app/sitemap default export', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('dispatches shard 0 (static) when called with Promise<"0">', async () => {
    const mod = await import('../../app/sitemap');
    const urls = await mod.default({ id: Promise.resolve('0') });
    // Static shard returns exactly 4 URLs (home, /jobs, /companies, /career-advice).
    expect(urls).toHaveLength(4);
    expect(new URL(urls[0]!.url).pathname).toBe('/');
  });

  it('dispatches shard 1 (companies)', async () => {
    mocked.company.findMany.mockResolvedValue([
      { id: 1, slug: 'acme', updatedAt: new Date() },
    ]);
    const mod = await import('../../app/sitemap');
    const urls = await mod.default({ id: Promise.resolve('1') });
    // 1 company → 2 URLs (overview + working-at)
    expect(urls).toHaveLength(2);
  });

  it('dispatches shard 2 (articles)', async () => {
    mocked.article.findMany.mockResolvedValue([]);
    const mod = await import('../../app/sitemap');
    const urls = await mod.default({ id: Promise.resolve('2') });
    expect(urls).toEqual([]);
    // Confirms we routed to the articles helper (which queries article.findMany).
    expect(mocked.article.findMany).toHaveBeenCalled();
  });

  it('dispatches shard 4+ as job shards', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    const mod = await import('../../app/sitemap');
    await mod.default({ id: Promise.resolve('4') });
    const args = mocked.job.findMany.mock.calls[0]?.[0] as {
      where: { id: { gt: number; lte: number } };
    };
    // Shard index 0 = id (0, JOBS_PER_SHARD].
    expect(args.where.id).toEqual({ gt: 0, lte: JOBS_PER_SHARD });
  });

  it('rejects non-numeric ids gracefully', async () => {
    const mod = await import('../../app/sitemap');
    const urls = await mod.default({ id: Promise.resolve('not-a-number') });
    expect(urls).toEqual([]);
  });
});

// generateSitemaps declares the right shard layout based on max job id.
describe('app/sitemap generateSitemaps', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('always declares the 4 non-job shards even with zero jobs', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: null } });
    const mod = await import('../../app/sitemap');
    const shards = await mod.generateSitemaps();
    expect(shards).toEqual([
      { id: 0 }, // static
      { id: 1 }, // companies
      { id: 2 }, // articles
      { id: 3 }, // landings
    ]);
  });

  it('appends job shards starting at id 4 when jobs exist', async () => {
    mocked.job.aggregate.mockResolvedValue({ _max: { id: JOBS_PER_SHARD * 2 + 1 } });
    const mod = await import('../../app/sitemap');
    const shards = await mod.generateSitemaps();
    // 4 non-job + 3 job shards (ceil((2*40k+1)/40k) = 3)
    expect(shards).toHaveLength(7);
    expect(shards[4]).toEqual({ id: 4 });
    expect(shards[5]).toEqual({ id: 5 });
    expect(shards[6]).toEqual({ id: 6 });
  });
});
