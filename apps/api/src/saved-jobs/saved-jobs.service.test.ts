import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    savedJob: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    application: { findMany: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { SavedJobsService } from './saved-jobs.service';

const mockedPrisma = prisma as unknown as {
  savedJob: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  application: { findMany: ReturnType<typeof vi.fn> };
};

describe('SavedJobsService.save / unsave', () => {
  let service: SavedJobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SavedJobsService();
  });

  it('saves a job', async () => {
    const row = { userId: 42, jobId: 7, savedAt: new Date() };
    mockedPrisma.savedJob.create.mockResolvedValue(row);
    expect(await service.save(42, 7)).toEqual(row);
  });

  it('returns the existing row on UNIQUE constraint (re-save is a no-op)', async () => {
    const existing = { userId: 42, jobId: 7, savedAt: new Date('2026-05-01') };
    mockedPrisma.savedJob.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    mockedPrisma.savedJob.findUnique.mockResolvedValue(existing);

    expect(await service.save(42, 7)).toEqual(existing);
  });

  it('rethrows non-P2002 errors as-is', async () => {
    mockedPrisma.savedJob.create.mockRejectedValue(
      Object.assign(new Error('DB down'), { code: 'P1001' }),
    );
    await expect(service.save(42, 7)).rejects.toThrow('DB down');
  });

  it('unsaves a job', async () => {
    mockedPrisma.savedJob.deleteMany.mockResolvedValue({ count: 1 });
    expect(await service.unsave(42, 7)).toEqual({ deleted: 1 });
  });

  it('findUserSaved returns null when not saved', async () => {
    mockedPrisma.savedJob.findUnique.mockResolvedValue(null);
    expect(await service.findUserSaved(42, 7)).toBeNull();
  });
});

describe('SavedJobsService.list', () => {
  let service: SavedJobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SavedJobsService();
  });

  it('paginates with default page=1 + savedAt desc', async () => {
    mockedPrisma.savedJob.findMany.mockResolvedValue([]);
    mockedPrisma.savedJob.count.mockResolvedValue(0);
    const out = await service.list(42, {});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(20);
    expect(mockedPrisma.savedJob.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 42 },
      orderBy: { savedAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('marks rows as applied when an Application row exists for the same job', async () => {
    mockedPrisma.savedJob.findMany.mockResolvedValue([
      {
        jobId: 1,
        savedAt: new Date(),
        job: {
          id: 1,
          title: 'A',
          canonicalSlug: 'a-1',
          status: 'ACTIVE',
          company: { id: 1, name: 'X', slug: 'x' },
        },
      },
      {
        jobId: 2,
        savedAt: new Date(),
        job: {
          id: 2,
          title: 'B',
          canonicalSlug: 'b-2',
          status: 'ACTIVE',
          company: { id: 2, name: 'Y', slug: 'y' },
        },
      },
    ]);
    mockedPrisma.savedJob.count.mockResolvedValue(2);
    mockedPrisma.application.findMany.mockResolvedValue([
      { jobId: 1, status: 'APPLIED' },
    ]);

    const out = await service.list(42, {});
    expect(out.hits).toHaveLength(2);
    expect(out.hits[0]).toMatchObject({ jobId: 1, applied: true, appliedStatus: 'APPLIED' });
    expect(out.hits[1]).toMatchObject({ jobId: 2, applied: false, appliedStatus: null });
  });

  it('skips the application lookup when no saved jobs', async () => {
    mockedPrisma.savedJob.findMany.mockResolvedValue([]);
    mockedPrisma.savedJob.count.mockResolvedValue(0);
    await service.list(42, {});
    expect(mockedPrisma.application.findMany).not.toHaveBeenCalled();
  });
});
