import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @jobportal/db before importing the service so the service picks up the mock.
vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
    application: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { ApplicationsService } from './applications.service';

const mockedPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  job: { findUnique: ReturnType<typeof vi.fn> };
  application: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe('ApplicationsService.apply', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ApplicationsService();
  });

  it('creates an Application for a verified user on an ACTIVE job', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mockedPrisma.application.create.mockResolvedValue({
      id: 1,
      userId: 42,
      jobId: 7,
      status: 'APPLIED',
      appliedAt: new Date(),
    });

    const app = await service.apply(42, 7);
    expect(app.id).toBe(1);
    expect(mockedPrisma.application.create).toHaveBeenCalledWith({
      data: { userId: 42, jobId: 7, status: 'APPLIED' },
    });
  });

  it('passes coverLetter through when provided', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mockedPrisma.application.create.mockResolvedValue({
      id: 2,
      userId: 42,
      jobId: 7,
      status: 'APPLIED',
      appliedAt: new Date(),
    });

    await service.apply(42, 7, 'Hello, I am interested.');
    expect(mockedPrisma.application.create).toHaveBeenCalledWith({
      data: {
        userId: 42,
        jobId: 7,
        status: 'APPLIED',
        coverLetter: 'Hello, I am interested.',
      },
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the user has not verified their email', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: false });
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when the job does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
    mockedPrisma.job.findUnique.mockResolvedValue(null);
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['CLOSED', 'EXPIRED', 'DRAFT'] as const)(
    'throws ForbiddenException when the job is %s',
    async (status) => {
      mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
      mockedPrisma.job.findUnique.mockResolvedValue({ status });
      await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  // The headline test from the SRS acceptance criteria — re-applying should be
  // a friendly 409, not a 500. The Prisma P2002 unique-constraint code maps to
  // ConflictException.
  it('throws ConflictException on UNIQUE constraint violation (re-apply)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    const dupErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockedPrisma.application.create.mockRejectedValue(dupErr);

    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows non-P2002 prisma errors as-is', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    const otherErr = Object.assign(new Error('Connection lost'), { code: 'P1001' });
    mockedPrisma.application.create.mockRejectedValue(otherErr);

    await expect(service.apply(42, 7)).rejects.toThrow('Connection lost');
  });
});
