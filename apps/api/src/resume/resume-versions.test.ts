import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    candidate: { findUnique: vi.fn(), update: vi.fn() },
    resume: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    application: { count: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

vi.mock('../profile/profile.service', () => ({
  recomputeCompleteness: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@jobportal/db';
import { ResumeService } from './resume.service';

const mocked = prisma as unknown as {
  candidate: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  resume: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeStorage = {
  getSignedDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
} as { getSignedDownloadUrl: ReturnType<typeof vi.fn>; deleteObject: ReturnType<typeof vi.fn> };

const clean = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  candidateId: 3,
  r2Key: `resumes/${id}.pdf`,
  originalFilename: `resume-${id}.pdf`,
  sizeBytes: 1000,
  mimeType: 'application/pdf',
  scanStatus: 'CLEAN',
  uploadedAt: new Date('2026-01-0' + ((id % 9) + 1)),
  deletedAt: null,
  ...over,
});

function makeService(): ResumeService {
  return new ResumeService(fakeStorage as unknown as never, {} as never);
}

describe('ResumeService.getDownloadUrl — own file, no plan gate', () => {
  let service: ResumeService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.getSignedDownloadUrl.mockResolvedValue('https://signed.example/resume.pdf');
    service = makeService();
  });

  it('signs a URL for the active resume without consulting any feature flag', async () => {
    // The download used to throw ForbiddenException whenever
    // feature.resume_download_pdf was off — which is the default. A candidate
    // could not retrieve the file they had uploaded themselves.
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: 55 });
    mocked.resume.findFirst.mockResolvedValue(clean(55));

    const result = await service.getDownloadUrl(9);

    expect(result.url).toBe('https://signed.example/resume.pdf');
    expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith('resumes/55.pdf', 900);
  });

  it('scopes the lookup to the caller, so another user id resolves to nothing', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: 55 });
    mocked.resume.findFirst.mockResolvedValue(null);

    await expect(service.getDownloadUrl(9, 999)).rejects.toBeInstanceOf(NotFoundException);
    // The where clause is what protects this endpoint now that the flag does not.
    expect(mocked.resume.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 999, candidateId: 3, deletedAt: null }),
      }),
    );
  });

  it('still refuses a file that has not passed the virus scan', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: 55 });
    mocked.resume.findFirst.mockResolvedValue(clean(55, { scanStatus: 'PENDING' }));

    await expect(service.getDownloadUrl(9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(fakeStorage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('404s when there is no resume at all', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: null });
    await expect(service.getDownloadUrl(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ResumeService.listVersions', () => {
  let service: ResumeService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = makeService();
  });

  it('marks exactly one version active', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: 55 });
    mocked.resume.findMany.mockResolvedValue([clean(57), clean(56), clean(55)]);

    const versions = await service.listVersions(9);

    expect(versions.map((v) => v.isActive)).toEqual([false, false, true]);
    expect(versions.filter((v) => v.isActive)).toHaveLength(1);
  });

  it('returns an empty list rather than throwing for a candidate-less user', async () => {
    mocked.candidate.findUnique.mockResolvedValue(null);
    await expect(service.listVersions(9)).resolves.toEqual([]);
  });

  it('excludes retired versions', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3, activeResumeId: 55 });
    mocked.resume.findMany.mockResolvedValue([]);
    await service.listVersions(9);
    expect(mocked.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});

describe('ResumeService.setActive', () => {
  let service: ResumeService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mocked),
    );
    service = makeService();
  });

  it('promotes an owned, clean version', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3 });
    mocked.resume.findFirst.mockResolvedValue(clean(56));

    const view = await service.setActive(9, 56);

    expect(view.isActive).toBe(true);
    expect(mocked.candidate.update).toHaveBeenCalledWith({
      where: { userId: 9 },
      data: { activeResumeId: 56 },
    });
  });

  it('refuses a version that is not the caller’s', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3 });
    mocked.resume.findFirst.mockResolvedValue(null);

    await expect(service.setActive(9, 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(mocked.candidate.update).not.toHaveBeenCalled();
  });

  it('refuses to activate a file still being scanned', async () => {
    mocked.candidate.findUnique.mockResolvedValue({ id: 3 });
    mocked.resume.findFirst.mockResolvedValue(clean(56, { scanStatus: 'PENDING' }));

    await expect(service.setActive(9, 56)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocked.candidate.update).not.toHaveBeenCalled();
  });
});
