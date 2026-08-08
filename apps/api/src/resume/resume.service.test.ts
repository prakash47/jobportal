import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    candidate: { findUnique: vi.fn(), update: vi.fn() },
    resume: { update: vi.fn() },
    application: { count: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    // The delete path runs its DB writes in an interactive transaction; hand
    // the callback the same mock so assertions see the calls.
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
  resume: { update: ReturnType<typeof vi.fn> };
  application: { count: ReturnType<typeof vi.fn> };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeStorage = {
  deleteObject: vi.fn().mockResolvedValue(undefined),
} as { deleteObject: ReturnType<typeof vi.fn> };

const fakeClamav = {} as never;

// ADR 0002 decision 7. Applications now record WHICH resume was submitted, and
// the recruiter reads it back through that snapshot. Destroying the stored
// object on delete would leave the row intact and the bytes gone, so the
// recruiter endpoint would presign a key that no longer exists — HTTP 200
// leading to a dead link, which is worse than serving it or refusing cleanly.
describe('ResumeService.delete — object retention', () => {
  let service: ResumeService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.deleteObject.mockResolvedValue(undefined);
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mocked),
    );
    mocked.candidate.findUnique.mockResolvedValue({
      id: 3,
      activeResumeId: 55,
      activeResume: { r2Key: 'resumes/55.pdf' },
    });
    service = new ResumeService(fakeStorage as unknown as never, fakeClamav);
  });

  it('deletes the stored object when nothing references the resume', async () => {
    mocked.application.count.mockResolvedValue(0);
    await service.delete(9);
    expect(fakeStorage.deleteObject).toHaveBeenCalledWith('resumes/55.pdf');
  });

  it('RETAINS the stored object when an application submitted it', async () => {
    mocked.application.count.mockResolvedValue(1);
    await service.delete(9);
    expect(fakeStorage.deleteObject).not.toHaveBeenCalled();
  });

  // The count must be scoped to THIS resume. Counting all applications would
  // retain every object forever the moment the platform had one application.
  it('counts references to the resume being deleted, not applications at large', async () => {
    mocked.application.count.mockResolvedValue(0);
    await service.delete(9);
    expect(mocked.application.count).toHaveBeenCalledWith({ where: { resumeId: 55 } });
  });

  // Retention is about the bytes only. The candidate has still withdrawn it:
  // the row is soft-deleted and unlinked from their profile either way.
  it('soft-deletes and unlinks regardless of retention', async () => {
    mocked.application.count.mockResolvedValue(1);
    await service.delete(9);
    expect(mocked.candidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activeResumeId: null } }),
    );
    expect(mocked.resume.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 } }),
    );
  });

  it('404s when there is no active resume', async () => {
    mocked.candidate.findUnique.mockResolvedValue(null);
    await expect(service.delete(9)).rejects.toBeInstanceOf(NotFoundException);
    expect(fakeStorage.deleteObject).not.toHaveBeenCalled();
  });
});
