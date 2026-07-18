import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { findFirst: vi.fn() },
    recruiter: { findMany: vi.fn(), findUnique: vi.fn() },
    jobCollaborator: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { RecruiterJobCollaboratorsService } from './recruiter-job-collaborators.service';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
const mocked = prisma as unknown as {
  job: { findFirst: ReturnType<typeof vi.fn> };
  recruiter: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  jobCollaborator: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

const fakeNotifications = {
  notifyJobCollaboration: vi.fn().mockResolvedValue(undefined),
} as { notifyJobCollaboration: ReturnType<typeof vi.fn> };

// The owner's job (userId 42 owns job 5 at company 7).
const ownedJob = { id: 5, companyId: 7, title: 'SE', postedBy: { name: 'Owner' } };

function makeService() {
  return new RecruiterJobCollaboratorsService(fakeNotifications as unknown as never);
}

describe('RecruiterJobCollaboratorsService.list', () => {
  let service: RecruiterJobCollaboratorsService;
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false);
    fakeNotifications.notifyJobCollaboration.mockResolvedValue(undefined);
    service = makeService();
  });

  it('404 when the caller is not the owner (no leak)', async () => {
    mocked.job.findFirst.mockResolvedValue(null);
    await expect(service.list(42, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns collaborators and assignable teammates (existing collaborators excluded)', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.jobCollaborator.findMany.mockResolvedValue([
      { user: { id: 3, name: 'Bob', image: null, recruiter: { designation: 'HR' } } },
    ]);
    // Company teammates: Bob (already a collaborator) + Carol (assignable).
    mocked.recruiter.findMany.mockResolvedValue([
      { designation: 'HR', user: { id: 3, name: 'Bob', image: null } },
      { designation: 'Eng', user: { id: 4, name: 'Carol', image: null } },
    ]);

    const out = await service.list(42, 5);
    expect(out.collaborators.map((c) => c.userId)).toEqual([3]);
    expect(out.assignable.map((a) => a.userId)).toEqual([4]); // Bob filtered out
    expect(out.collaborators[0]).toMatchObject({ name: 'Bob', designation: 'HR' });
  });
});

describe('RecruiterJobCollaboratorsService.add', () => {
  let service: RecruiterJobCollaboratorsService;
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false);
    fakeNotifications.notifyJobCollaboration.mockResolvedValue(undefined);
    service = makeService();
  });

  it('killswitch ON → 503 before any DB work', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(service.add(42, 5, 4)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocked.job.findFirst).not.toHaveBeenCalled();
    expect(mocked.jobCollaborator.create).not.toHaveBeenCalled();
  });

  it('non-owner job → 404', async () => {
    mocked.job.findFirst.mockResolvedValue(null);
    await expect(service.add(42, 5, 4)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adding yourself → 400', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    await expect(service.add(42, 5, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.jobCollaborator.create).not.toHaveBeenCalled();
  });

  it('teammate in a different company → 400 (no cross-company grant)', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.recruiter.findUnique.mockResolvedValue({
      companyId: 999,
      deactivatedAt: null,
      designation: 'Eng',
      user: { id: 4, name: 'Carol', image: null },
    });
    await expect(service.add(42, 5, 4)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.jobCollaborator.create).not.toHaveBeenCalled();
  });

  it('deactivated teammate → 400', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.recruiter.findUnique.mockResolvedValue({
      companyId: 7,
      deactivatedAt: new Date('2026-01-01'),
      designation: 'Eng',
      user: { id: 4, name: 'Carol', image: null },
    });
    await expect(service.add(42, 5, 4)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy path → creates the row + notifies the teammate', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.recruiter.findUnique.mockResolvedValue({
      companyId: 7,
      deactivatedAt: null,
      designation: 'Eng',
      user: { id: 4, name: 'Carol', image: null },
    });
    mocked.jobCollaborator.findUnique.mockResolvedValue(null); // not yet a collaborator
    mocked.jobCollaborator.create.mockResolvedValue({ id: 1 });

    const out = await service.add(42, 5, 4);

    expect(out).toMatchObject({ userId: 4, name: 'Carol', designation: 'Eng' });
    expect(mocked.jobCollaborator.create).toHaveBeenCalledWith({
      data: { jobId: 5, userId: 4, addedById: 42 },
    });
    // Notification is fire-and-log — let the promise settle.
    await Promise.resolve();
    expect(fakeNotifications.notifyJobCollaboration).toHaveBeenCalledWith({
      recruiterUserId: 4,
      jobId: 5,
      jobTitle: 'SE',
      invitedByName: 'Owner',
    });
  });

  it('idempotent: re-adding an existing collaborator does not duplicate or re-notify', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.recruiter.findUnique.mockResolvedValue({
      companyId: 7,
      deactivatedAt: null,
      designation: 'Eng',
      user: { id: 4, name: 'Carol', image: null },
    });
    mocked.jobCollaborator.findUnique.mockResolvedValue({ id: 1 }); // already a collaborator

    const out = await service.add(42, 5, 4);
    expect(out).toMatchObject({ userId: 4 });
    expect(mocked.jobCollaborator.create).not.toHaveBeenCalled();
    expect(fakeNotifications.notifyJobCollaboration).not.toHaveBeenCalled();
  });
});

describe('RecruiterJobCollaboratorsService.remove', () => {
  let service: RecruiterJobCollaboratorsService;
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false);
    service = makeService();
  });

  it('killswitch ON → 503 before any DB work', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(service.remove(42, 5, 4)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocked.job.findFirst).not.toHaveBeenCalled();
    expect(mocked.jobCollaborator.deleteMany).not.toHaveBeenCalled();
  });

  it('non-owner job → 404', async () => {
    mocked.job.findFirst.mockResolvedValue(null);
    await expect(service.remove(42, 5, 4)).rejects.toBeInstanceOf(NotFoundException);
    expect(mocked.jobCollaborator.deleteMany).not.toHaveBeenCalled();
  });

  it('happy path → deletes the collaborator row', async () => {
    mocked.job.findFirst.mockResolvedValue(ownedJob);
    mocked.jobCollaborator.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(42, 5, 4)).resolves.toBeUndefined();
    expect(mocked.jobCollaborator.deleteMany).toHaveBeenCalledWith({
      where: { jobId: 5, userId: 4 },
    });
  });
});
