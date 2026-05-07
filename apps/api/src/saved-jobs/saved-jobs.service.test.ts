import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    savedJob: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { SavedJobsService } from './saved-jobs.service';

const mockedPrisma = prisma as unknown as {
  savedJob: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe('SavedJobsService', () => {
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

  // Idempotent save — re-saving an already-saved job should NOT throw; it
  // should return the existing row.
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
