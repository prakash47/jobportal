import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: { job: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock('@jobportal/search', () => ({ syncJob: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { CachePurgeService } from '../cache-purge/cache-purge.service';
import { JobLifecycleProcessor } from './job-lifecycle.processor';

const mocked = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
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
