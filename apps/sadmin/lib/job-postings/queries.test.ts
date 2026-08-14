import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted above the SUT import so the module under test binds to the mock.
vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { findMany: vi.fn(), count: vi.fn() },
    application: { count: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { countJobApplications, listJobPostings } from './queries';

const m = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  application: { count: ReturnType<typeof vi.fn> };
};

/** The shape findMany returns — the mapper reads `_count`, not a flat column. */
function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Senior Frontend Engineer',
    canonicalSlug: 'senior-frontend-engineer-1',
    status: 'ACTIVE',
    postedAt: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date('2026-07-30T00:00:00Z'),
    expiresAt: null,
    company: { id: 7, name: 'Acme' },
    postedBy: { name: 'Priya Sharma', email: 'priya@acme.in' },
    primaryCity: { name: 'Bangalore' },
    _count: { applications: 0 },
    ...over,
  };
}

describe('listJobPostings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.job.findMany.mockResolvedValue([]);
    m.job.count.mockResolvedValue(0);
  });

  const whereOf = (): Record<string, unknown> =>
    m.job.findMany.mock.calls[0]?.[0].where as Record<string, unknown>;

  it('filters on the requested status', async () => {
    await listJobPostings(1, 'DRAFT');
    expect(whereOf()).toEqual({ status: 'DRAFT' });
  });

  // 'ALL' is a pseudo-status meaning "no predicate". Setting `status: undefined`
  // instead of omitting the key would still be an object Prisma has to reason
  // about, and reads as an oversight.
  it('omits the status key entirely for the ALL tab', async () => {
    await listJobPostings(1, 'ALL');
    expect(whereOf()).toEqual({});
    expect('status' in whereOf()).toBe(false);
  });

  // ⚠ The most important assertion here. The review queue scopes to
  // PENDING_MODERATION or a non-null reviewedAt, which between them MISS every
  // job published while moderation was off. This list is the only surface that
  // can see those, so it must apply no baseline filter of its own.
  it('applies no baseline filter beyond the chosen status', async () => {
    await listJobPostings(1, 'ALL');
    const where = whereOf();
    expect(where).not.toHaveProperty('reviewedAt');
    expect(where).not.toHaveProperty('submittedForReviewAt');
    expect(where).not.toHaveProperty('postedById');
  });

  it('searches the title and the company name together', async () => {
    await listJobPostings(1, 'ACTIVE', 'acme');
    expect(whereOf()).toEqual({
      status: 'ACTIVE',
      OR: [
        { title: { contains: 'acme', mode: 'insensitive' } },
        { company: { name: { contains: 'acme', mode: 'insensitive' } } },
      ],
    });
  });

  it('omits the search arm when there is no query', async () => {
    await listJobPostings(1, 'ACTIVE');
    expect(whereOf()).not.toHaveProperty('OR');
  });

  // A divergence here makes the total, the count line, the pagination links and
  // the over-range redirect all disagree with the visible rows.
  it('hands the identical where object to findMany and count', async () => {
    await listJobPostings(2, 'CLOSED', 'acme');
    expect(m.job.count.mock.calls[0]?.[0].where).toBe(whereOf());
  });

  // postedAt is null for every DRAFT and every job awaiting review — exactly the
  // rows this list exists to surface — so ordering on it would clump them
  // arbitrarily. The id tiebreak keeps offset pagination a total order.
  it('orders by createdAt with an id tiebreak, never postedAt', async () => {
    await listJobPostings(1, 'ALL');
    expect(m.job.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('pages 20 at a time with the right offset', async () => {
    await listJobPostings(3, 'ACTIVE');
    expect(m.job.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 40, take: 20 });
  });

  // Without this the Delete guard has nothing to read and would either offer a
  // button that 409s or hide one that should work.
  it('requests the application count that gates Delete', async () => {
    await listJobPostings(1, 'ACTIVE');
    expect(m.job.findMany.mock.calls[0]?.[0].select._count).toEqual({
      select: { applications: true },
    });
  });

  it('flattens _count into applicationCount on each row', async () => {
    m.job.findMany.mockResolvedValue([jobRow({ _count: { applications: 4 } })]);
    m.job.count.mockResolvedValue(1);

    const out = await listJobPostings(1, 'ACTIVE');

    expect(out.rows[0]?.applicationCount).toBe(4);
    expect(out).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  });

  // Job.postedById is SetNull when a recruiter departs, and company is a
  // nullable relation on the row shape. Neither may 500 the list.
  it('tolerates a departed poster and a missing company', async () => {
    m.job.findMany.mockResolvedValue([jobRow({ postedBy: null, company: null })]);
    const out = await listJobPostings(1, 'ALL');
    expect(out.rows[0]?.postedBy).toBeNull();
    expect(out.rows[0]?.company).toBeNull();
  });
});

describe('countJobApplications', () => {
  beforeEach(() => vi.resetAllMocks());

  it('counts applications for the one job', async () => {
    m.application.count.mockResolvedValue(3);
    await expect(countJobApplications(42)).resolves.toBe(3);
    expect(m.application.count).toHaveBeenCalledWith({ where: { jobId: 42 } });
  });
});
