import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { findMany: vi.fn(), updateMany: vi.fn() },
    otpChallenge: { deleteMany: vi.fn() },
  },
}));
vi.mock('@jobportal/search', () => ({ syncJob: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { CachePurgeService } from '../cache-purge/cache-purge.service';
import { JobLifecycleProcessor } from './job-lifecycle.processor';

const mocked = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  otpChallenge: { deleteMany: ReturnType<typeof vi.fn> };
};
const mockedSync = syncJob as ReturnType<typeof vi.fn>;

describe('JobLifecycleProcessor.expireStaleJobs', () => {
  let proc: JobLifecycleProcessor;
  let cachePurge: { purgeJob: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockedSync.mockResolvedValue(undefined);
    cachePurge = { purgeJob: vi.fn().mockResolvedValue(undefined) };
    proc = new JobLifecycleProcessor(cachePurge as unknown as CachePurgeService);
  });

  afterEach(() => {
    delete process.env['JOB_EXPIRY_DISABLED'];
  });

  it('zero stale → no-op (no updateMany, no syncJob)', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    const out = await proc.expireStaleJobs();
    expect(out.expired).toBe(0);
    expect(mocked.job.updateMany).not.toHaveBeenCalled();
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('multiple stale → batch updateMany + per-id syncJob remove', async () => {
    mocked.job.findMany.mockResolvedValue([
      { id: 1, canonicalSlug: 'foo-1' },
      { id: 2, canonicalSlug: 'bar-2' },
      { id: 3, canonicalSlug: 'baz-3' },
    ]);
    mocked.job.updateMany.mockResolvedValue({ count: 3 });

    const out = await proc.expireStaleJobs();
    expect(out.expired).toBe(3);
    expect(mocked.job.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] } },
      data: { status: 'EXPIRED' },
    });
    // Fire-and-log; the .catch handlers attach synchronously after each call.
    await Promise.resolve();
    expect(mockedSync).toHaveBeenCalledTimes(3);
    expect(mockedSync).toHaveBeenCalledWith(1, 'remove');
    expect(mockedSync).toHaveBeenCalledWith(2, 'remove');
    expect(mockedSync).toHaveBeenCalledWith(3, 'remove');
    expect(cachePurge.purgeJob).toHaveBeenCalledTimes(3);
    expect(cachePurge.purgeJob).toHaveBeenCalledWith('foo-1');
    expect(cachePurge.purgeJob).toHaveBeenCalledWith('bar-2');
    expect(cachePurge.purgeJob).toHaveBeenCalledWith('baz-3');
  });

  it('JOB_EXPIRY_DISABLED=1 short-circuits without DB read', async () => {
    process.env['JOB_EXPIRY_DISABLED'] = '1';
    const out = await proc.expireStaleJobs();
    expect(out.expired).toBe(0);
    expect(mocked.job.findMany).not.toHaveBeenCalled();
  });

  it('queries ACTIVE jobs whose expiresAt has passed', async () => {
    mocked.job.findMany.mockResolvedValue([]);
    await proc.expireStaleJobs();
    const args = mocked.job.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      status: 'ACTIVE',
      expiresAt: expect.objectContaining({ not: null }),
    });
    const dateFilter = (args.where['expiresAt'] as { lt: Date }).lt;
    expect(dateFilter).toBeInstanceOf(Date);
  });
});

describe('JobLifecycleProcessor.purgeExpiredOtps', () => {
  const NOW = new Date('2026-07-29T10:00:00.000Z');
  let proc: JobLifecycleProcessor;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    proc = new JobLifecycleProcessor(
      { purgeJob: vi.fn() } as unknown as CachePurgeService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes challenges that expired more than an hour ago', async () => {
    mocked.otpChallenge.deleteMany.mockResolvedValue({ count: 4 });
    const out = await proc.purgeExpiredOtps();
    expect(out.purged).toBe(4);
    expect(mocked.otpChallenge.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date(NOW.getTime() - 60 * 60 * 1000) } },
    });
  });

  // The grace window is what lets verify() keep answering "that code has
  // expired" instead of the misleading "request a code first".
  it('leaves a just-expired challenge alone', async () => {
    mocked.otpChallenge.deleteMany.mockResolvedValue({ count: 0 });
    await proc.purgeExpiredOtps();
    const args = mocked.otpChallenge.deleteMany.mock.calls[0]?.[0] as {
      where: { expiresAt: { lt: Date } };
    };
    const justExpired = new Date(NOW.getTime() - 1000);
    expect(justExpired.getTime()).toBeGreaterThan(args.where.expiresAt.lt.getTime());
  });

  // A repeatable can be replayed after a failure, so a second run on the same
  // minute has to be harmless.
  it('is idempotent — a re-run deletes nothing further', async () => {
    mocked.otpChallenge.deleteMany.mockResolvedValueOnce({ count: 4 });
    mocked.otpChallenge.deleteMany.mockResolvedValueOnce({ count: 0 });
    await proc.purgeExpiredOtps();
    await expect(proc.purgeExpiredOtps()).resolves.toEqual({ purged: 0 });
  });

  // A single deleteMany, not a find-then-delete: nothing downstream needs to
  // know which rows went, and reading them would pull plaintext codes into
  // memory for no reason.
  it('deletes in one statement, selecting nothing back', async () => {
    mocked.otpChallenge.deleteMany.mockResolvedValue({ count: 1 });
    await proc.purgeExpiredOtps();
    expect(mocked.otpChallenge.deleteMany).toHaveBeenCalledTimes(1);
    const args = mocked.otpChallenge.deleteMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(args)).toEqual(['where']);
  });
});
