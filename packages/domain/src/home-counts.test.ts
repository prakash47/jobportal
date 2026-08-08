import { beforeEach, describe, expect, it, vi } from 'vitest';

// The seeded database has 12 companies and all 12 are hiring, so the filtered
// and unfiltered counts are coincidentally identical there — a live check
// cannot tell them apart. This suite is what actually pins the change.
vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    company: { count: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn() },
    article: { findMany: vi.fn() },
    city: { findMany: vi.fn() },
    industry: { findMany: vi.fn() },
    skill: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
  Prisma: {
    sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings, vals }),
    join: (parts: unknown[]) => parts,
    raw: (s: string) => s,
  },
}));

import { prisma } from '@jobportal/db';
import { loadHomePageData } from './home-queries';

// Spelled out rather than a Record index signature: under
// noUncheckedIndexedAccess every property read off a Record<string, X> widens
// to `X | undefined`, so `db.job.count` is a compile error even though it
// always exists. Matches the idiom in apps/api/src/public-companies/
// public-companies.test.ts.
const db = prisma as unknown as {
  job: {
    count: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  company: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  user: { count: ReturnType<typeof vi.fn> };
  article: { findMany: ReturnType<typeof vi.fn> };
  city: { findMany: ReturnType<typeof vi.fn> };
  industry: { findMany: ReturnType<typeof vi.fn> };
  skill: { findMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.job.count.mockResolvedValue(43);
  db.company.count.mockResolvedValue(7);
  db.user.count.mockResolvedValue(8);
  db.job.groupBy.mockResolvedValue([]);
  db.job.findMany.mockResolvedValue([]);
  db.company.findMany.mockResolvedValue([]);
  db.article.findMany.mockResolvedValue([]);
  db.city.findMany.mockResolvedValue([]);
  db.industry.findMany.mockResolvedValue([]);
  db.skill.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe('loadHomePageData — counts', () => {
  it('counts only companies that are HIRING, not every row in the table', async () => {
    // ADR 0002 §5, owner-approved. The number was an unfiltered
    // company.count() shown beside a live job count, which read as "employers
    // you could apply to" while including companies with nothing open.
    await loadHomePageData();
    expect(db.company.count).toHaveBeenCalledWith({
      where: { jobs: { some: { status: 'ACTIVE' } } },
    });
  });

  it('still counts only ACTIVE jobs', async () => {
    await loadHomePageData();
    expect(db.job.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('counts recruiter ACCOUNTS — the field is named for what it measures', async () => {
    // The mobile spec asked for `hiringTeams`. No such field exists, and it
    // would misdescribe this number: several recruiters routinely share one
    // employer, so accounts are not teams.
    await loadHomePageData();
    expect(db.user.count).toHaveBeenCalledWith({ where: { role: 'RECRUITER' } });
    const out = await loadHomePageData();
    expect(out.counts).toEqual({ activeJobs: 43, companies: 7, recruiters: 8 });
    expect(Object.keys(out.counts)).not.toContain('hiringTeams');
  });
});
