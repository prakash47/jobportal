import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { count: vi.fn() },
    user: { count: vi.fn() },
    job: { count: vi.fn() },
    companyKyc: { count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { getActivityTrends, getPendingApprovals, getSignupStats } from './queries';

const mocked = prisma as unknown as {
  job: { count: ReturnType<typeof vi.fn> };
  companyKyc: { count: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};
const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;

/** 30 rows shaped like the signup query's output. */
function signupRows(values: Array<[number, number]>) {
  return values.map(([candidates, recruiters], i) => ({
    day: `2026-07-${String(i + 1).padStart(2, '0')}`,
    candidates,
    recruiters,
  }));
}

describe('getPendingApprovals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.companyKyc.count.mockResolvedValue(3);
    mocked.job.count.mockResolvedValue(5);
    mockedFlag.mockResolvedValue(false);
  });

  it('returns both queues plus the moderation state', async () => {
    await expect(getPendingApprovals()).resolves.toEqual({
      companyVerification: 3,
      jobPostings: 5,
      moderationEnabled: false,
    });
  });

  // NOT_SUBMITTED has nothing to review and APPROVED/REJECTED are already
  // decided — counting them would inflate the queue with work that does not exist.
  it('counts only PENDING company verifications', async () => {
    await getPendingApprovals();
    expect(mocked.companyKyc.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
  });

  it('counts only PENDING_MODERATION jobs', async () => {
    await getPendingApprovals();
    expect(mocked.job.count).toHaveBeenCalledWith({ where: { status: 'PENDING_MODERATION' } });
  });

  // CLAUDE.md §4 — the flag must be evaluated through the package, never by
  // reading the FeatureFlag row inline.
  it('evaluates the moderation flag through @jobportal/feature-flags', async () => {
    await getPendingApprovals();
    expect(mockedFlag).toHaveBeenCalledWith('moderation.jobs.enabled');
  });

  it('reports moderation as enabled when the flag is on', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(getPendingApprovals()).resolves.toMatchObject({ moderationEnabled: true });
  });
});

describe('getSignupStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sums candidates and recruiters into each day of the chart', async () => {
    mocked.$queryRaw.mockResolvedValue(signupRows([[2, 1], [0, 0], [4, 3]]));
    const out = await getSignupStats();
    expect(out.daily.map((p) => p.value)).toEqual([3, 0, 7]);
  });

  // The headline figures are derived from the same array the chart plots, so
  // they can never disagree with it.
  it('takes "today" from the LAST bucket, which is IST today', async () => {
    mocked.$queryRaw.mockResolvedValue(signupRows([[1, 0], [2, 0], [9, 0]]));
    await expect(getSignupStats()).resolves.toMatchObject({ today: 9 });
  });

  it('sums the last 7 buckets for the 7-day figure', async () => {
    // 10 days of 1 signup each -> last7 = 7, last30 = 10.
    mocked.$queryRaw.mockResolvedValue(signupRows(new Array(10).fill([1, 0])));
    await expect(getSignupStats()).resolves.toMatchObject({ last7: 7, last30: 10 });
  });

  it('splits the 30-day total by role', async () => {
    mocked.$queryRaw.mockResolvedValue(signupRows([[2, 1], [3, 4]]));
    await expect(getSignupStats()).resolves.toMatchObject({
      candidates30: 5,
      recruiters30: 5,
    });
  });

  it('formats day labels without ever parsing a Date', async () => {
    mocked.$queryRaw.mockResolvedValue([{ day: '2026-07-09', candidates: 1, recruiters: 0 }]);
    const out = await getSignupStats();
    expect(out.daily[0]!.label).toBe('9 Jul');
  });

  it('survives an empty window without producing NaN or undefined', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await expect(getSignupStats()).resolves.toEqual({
      today: 0,
      last7: 0,
      last30: 0,
      candidates30: 0,
      recruiters30: 0,
      daily: [],
    });
  });

  // The SQL is what guarantees IST bucketing; a single AT TIME ZONE is wrong in
  // both directions on a `timestamp without time zone` column holding UTC.
  it('buckets by IST using the double AT TIME ZONE conversion', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await getSignupStats();
    const sql = mocked.$queryRaw.mock.calls[0]![0].join('?');
    expect(sql).toContain(`AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`);
    expect(sql).toContain('generate_series');
  });

  // Internal staff accounts are not signups.
  it('counts only CANDIDATE and RECRUITER roles, never ADMIN', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await getSignupStats();
    const sql = mocked.$queryRaw.mock.calls[0]![0].join('?');
    expect(sql).toContain(`u.role = 'CANDIDATE'`);
    expect(sql).toContain(`u.role = 'RECRUITER'`);
    expect(sql).not.toContain('ADMIN');
  });
});

describe('getActivityTrends', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns both series with their totals', async () => {
    mocked.$queryRaw
      .mockResolvedValueOnce([
        { day: '2026-07-01', count: 2 },
        { day: '2026-07-02', count: 3 },
      ])
      .mockResolvedValueOnce([
        { day: '2026-07-01', count: 10 },
        { day: '2026-07-02', count: 20 },
      ]);

    const out = await getActivityTrends();
    expect(out.jobs.map((p) => p.value)).toEqual([2, 3]);
    expect(out.applications.map((p) => p.value)).toEqual([10, 20]);
    expect(out.totalJobs).toBe(5);
    expect(out.totalApplications).toBe(30);
  });

  it('issues exactly one query per series', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await getActivityTrends();
    expect(mocked.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('buckets both series in IST', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await getActivityTrends();
    for (const call of mocked.$queryRaw.mock.calls) {
      expect(call[0].join('?')).toContain(`AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`);
    }
  });

  // A job enters the market when it is PUBLISHED. Drafts have a null postedAt
  // and are excluded by the join rather than by a status filter.
  it('measures jobs by postedAt, not createdAt', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await getActivityTrends();
    const jobSql = mocked.$queryRaw.mock.calls[0]![0].join('?');
    expect(jobSql).toContain('postedAt');
    expect(jobSql).not.toContain('createdAt');
  });

  it('returns zero totals for an empty window', async () => {
    mocked.$queryRaw.mockResolvedValue([]);
    await expect(getActivityTrends()).resolves.toEqual({
      jobs: [],
      applications: [],
      totalJobs: 0,
      totalApplications: 0,
    });
  });
});
