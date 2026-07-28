import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { count: vi.fn() },
    user: { count: vi.fn() },
    job: { count: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { getPlatformKpis } from './queries';

const mocked = prisma as unknown as {
  recruiter: { count: ReturnType<typeof vi.fn> };
  user: { count: ReturnType<typeof vi.fn> };
  job: { count: ReturnType<typeof vi.fn> };
};

// These tests exist because all three counts have a plausible-looking WRONG
// query, and two of them fail in opposite directions. A regression here would
// not throw, would not fail a build, and would not look wrong on screen — it
// would just quietly report a number nobody could audit. So the where-clauses
// are pinned, not merely the return shape.
describe('getPlatformKpis', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.recruiter.count.mockResolvedValue(10);
    mocked.user.count.mockResolvedValue(20);
    mocked.job.count.mockResolvedValue(52);
  });

  it('returns the three totals', async () => {
    await expect(getPlatformKpis()).resolves.toEqual({
      recruiters: 10,
      seekers: 20,
      openJobs: 52,
    });
  });

  // Removing a teammate sets Recruiter.deactivatedAt and never touches the User
  // row, so `user.count({role:'RECRUITER'})` would count people who can no
  // longer sign in — and could only ever grow.
  it('counts recruiters from Recruiter rows, excluding soft-removed teammates', async () => {
    await getPlatformKpis();

    expect(mocked.recruiter.count).toHaveBeenCalledWith({ where: { deactivatedAt: null } });
  });

  // The mirror-image trap: Candidate rows are provisioned lazily on first
  // /profile read, so counting them under-counts real registrations.
  it('counts seekers from User rows by role, not from Candidate rows', async () => {
    await getPlatformKpis();

    expect(mocked.user.count).toHaveBeenCalledWith({ where: { role: 'CANDIDATE' } });
  });

  // "Open" is the UI label for JobStatus.ACTIVE. DRAFT / PENDING_MODERATION /
  // EXPIRED / CLOSED are all real states and none of them is open.
  it('counts only ACTIVE jobs as open', async () => {
    await getPlatformKpis();

    expect(mocked.job.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });

  it('never counts users by the RECRUITER role', async () => {
    await getPlatformKpis();

    const roleFilters = mocked.user.count.mock.calls.map(
      (c) => (c[0] as { where?: { role?: string } } | undefined)?.where?.role,
    );
    expect(roleFilters).not.toContain('RECRUITER');
  });

  it('issues exactly one query per card', async () => {
    await getPlatformKpis();

    expect(mocked.recruiter.count).toHaveBeenCalledTimes(1);
    expect(mocked.user.count).toHaveBeenCalledTimes(1);
    expect(mocked.job.count).toHaveBeenCalledTimes(1);
  });

  it('reports genuine zeroes rather than coercing them away', async () => {
    mocked.recruiter.count.mockResolvedValue(0);
    mocked.user.count.mockResolvedValue(0);
    mocked.job.count.mockResolvedValue(0);

    await expect(getPlatformKpis()).resolves.toEqual({
      recruiters: 0,
      seekers: 0,
      openJobs: 0,
    });
  });
});
