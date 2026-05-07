import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
    application: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
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
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const fakeEmail = {
  sendApplicationStatusChange: vi.fn().mockResolvedValue(undefined),
} as { sendApplicationStatusChange: ReturnType<typeof vi.fn> };

describe('ApplicationsService.apply', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ApplicationsService(fakeEmail as unknown as never);
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

describe('ApplicationsService.list', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ApplicationsService(fakeEmail as unknown as never);
  });

  it('paginates with default page=1, status=ALL', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    const out = await service.list(42, {});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(20);
    expect(mockedPrisma.application.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 42 },
      orderBy: { appliedAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('narrows by status when filter is supplied', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    await service.list(42, { status: 'OFFERED', page: 2 });
    expect(mockedPrisma.application.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 42, status: 'OFFERED' },
      skip: 20,
    });
  });

  it('treats status=ALL as no narrowing', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    await service.list(42, { status: 'ALL' });
    const callArgs = mockedPrisma.application.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(callArgs.where).toEqual({ userId: 42 });
  });
});

describe('ApplicationsService.withdraw', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ApplicationsService(fakeEmail as unknown as never);
  });

  const ownedRow = {
    id: 99,
    userId: 42,
    status: 'APPLIED' as const,
    statusHistory: [],
    job: { title: 'SE', company: { name: 'Acme' } },
    user: { email: 'me@example.com' },
  };

  it('flips APPLIED → WITHDRAWN, appends history, fires email', async () => {
    mockedPrisma.application.findUnique.mockResolvedValue(ownedRow);
    mockedPrisma.application.update.mockResolvedValue({
      ...ownedRow,
      status: 'WITHDRAWN',
      updatedAt: new Date(),
    });

    const out = await service.withdraw(42, 99);
    expect(out.status).toBe('WITHDRAWN');
    const call = mockedPrisma.application.update.mock.calls[0]?.[0] as {
      data: { statusHistory: Array<Record<string, unknown>> };
    };
    expect(call.data.statusHistory).toHaveLength(1);
    expect(call.data.statusHistory[0]).toMatchObject({
      from: 'APPLIED',
      to: 'WITHDRAWN',
      by: 'CANDIDATE',
    });
    expect(fakeEmail.sendApplicationStatusChange).toHaveBeenCalledWith(
      'me@example.com',
      expect.objectContaining({ from: 'APPLIED', to: 'WITHDRAWN' }),
    );
  });

  it('preserves prior history entries', async () => {
    mockedPrisma.application.findUnique.mockResolvedValue({
      ...ownedRow,
      status: 'IN_REVIEW',
      statusHistory: [
        { from: 'APPLIED', to: 'IN_REVIEW', at: '2026-04-01T00:00:00Z', by: 'RECRUITER' },
      ],
    });
    mockedPrisma.application.update.mockResolvedValue({ ...ownedRow, status: 'WITHDRAWN' });

    await service.withdraw(42, 99);
    const call = mockedPrisma.application.update.mock.calls[0]?.[0] as {
      data: { statusHistory: Array<Record<string, unknown>> };
    };
    expect(call.data.statusHistory).toHaveLength(2);
  });

  it('404s when the application does not exist', async () => {
    mockedPrisma.application.findUnique.mockResolvedValue(null);
    await expect(service.withdraw(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s on cross-user access (does not leak existence)', async () => {
    mockedPrisma.application.findUnique.mockResolvedValue({ ...ownedRow, userId: 1 });
    await expect(service.withdraw(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['HIRED', 'REJECTED', 'WITHDRAWN'] as const)(
    'rejects withdraw on terminal status %s',
    async (status) => {
      mockedPrisma.application.findUnique.mockResolvedValue({ ...ownedRow, status });
      await expect(service.withdraw(42, 99)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
