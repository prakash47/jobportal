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
      groupBy: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
    groupBy: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

const fakeEmail = {
  enqueueApplicationSubmitted: vi.fn().mockResolvedValue(undefined),
  enqueueApplicationStatusChange: vi.fn().mockResolvedValue(undefined),
} as {
  enqueueApplicationSubmitted: ReturnType<typeof vi.fn>;
  enqueueApplicationStatusChange: ReturnType<typeof vi.fn>;
};

const fakeQuota = {
  consume: vi.fn().mockResolvedValue({ count: 1, limit: 10, unlimited: false, upgradeAvailable: false }),
} as { consume: ReturnType<typeof vi.fn> };

// Recruiter notification producer — fire-and-log side effect on apply().
const fakeNotifications = {
  notifyNewApplication: vi.fn().mockResolvedValue(undefined),
} as { notifyNewApplication: ReturnType<typeof vi.fn> };

describe('ApplicationsService.apply', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEmail.enqueueApplicationSubmitted.mockResolvedValue(undefined);
    fakeEmail.enqueueApplicationStatusChange.mockResolvedValue(undefined);
    fakeQuota.consume.mockResolvedValue({
      count: 1,
      limit: 10,
      unlimited: false,
      upgradeAvailable: false,
    });
    fakeNotifications.notifyNewApplication.mockResolvedValue(undefined);
    service = new ApplicationsService(
      fakeEmail as unknown as never,
      fakeQuota as unknown as never,
      fakeNotifications as unknown as never,
    );
  });

  it('creates an Application for a verified user on an ACTIVE job', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
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
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
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
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: false, email: 'cand@example.com' });
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when the job does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue(null);
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['CLOSED', 'EXPIRED', 'DRAFT'] as const)(
    'throws ForbiddenException when the job is %s',
    async (status) => {
      mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
      mockedPrisma.job.findUnique.mockResolvedValue({ status, title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
      await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('throws ConflictException on UNIQUE constraint violation (re-apply)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
    const dupErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockedPrisma.application.create.mockRejectedValue(dupErr);

    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows non-P2002 prisma errors as-is', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
    const otherErr = Object.assign(new Error('Connection lost'), { code: 'P1001' });
    mockedPrisma.application.create.mockRejectedValue(otherErr);

    await expect(service.apply(42, 7)).rejects.toThrow('Connection lost');
  });

  // SRS §4.11.16-17 — quota integration. Layer 3 of three-layer enforcement.
  it('calls quota.consume after a successful application.create', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
    mockedPrisma.application.create.mockResolvedValue({
      id: 1,
      userId: 42,
      jobId: 7,
      status: 'APPLIED',
      appliedAt: new Date(),
    });
    await service.apply(42, 7);
    expect(fakeQuota.consume).toHaveBeenCalledWith(42);
  });

  it('fires a recruiter new-application notification to the job owner after a successful apply', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      emailVerified: true,
      email: 'cand@example.com',
      name: 'Asha Rao',
    });
    mockedPrisma.job.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      title: 'Backend Engineer',
      canonicalSlug: 'be-1',
      postedById: 7,
      company: { name: 'Acme' },
    });
    mockedPrisma.application.create.mockResolvedValue({
      id: 3,
      userId: 42,
      jobId: 9,
      status: 'APPLIED',
      appliedAt: new Date(),
    });

    await service.apply(42, 9);
    expect(fakeNotifications.notifyNewApplication).toHaveBeenCalledWith({
      recruiterUserId: 7,
      jobId: 9,
      jobTitle: 'Backend Engineer',
      candidateName: 'Asha Rao',
    });
  });

  it('still succeeds when the recruiter notification producer rejects (fire-and-log)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      emailVerified: true,
      email: 'cand@example.com',
      name: 'Asha Rao',
    });
    mockedPrisma.job.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      title: 'Backend Engineer',
      canonicalSlug: 'be-1',
      postedById: 7,
      company: { name: 'Acme' },
    });
    mockedPrisma.application.create.mockResolvedValue({
      id: 5,
      userId: 42,
      jobId: 9,
      status: 'APPLIED',
      appliedAt: new Date(),
    });
    // The notification write is fire-and-log; a failure must NOT turn a
    // successful apply into a 5xx (guards against someone awaiting the producer
    // or dropping the .catch()).
    fakeNotifications.notifyNewApplication.mockRejectedValueOnce(new Error('db down'));

    await expect(service.apply(42, 9)).resolves.toMatchObject({ id: 5 });
  });

  it('does NOT call quota.consume on P2002 (re-apply does not cost a slot)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
    const dupErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockedPrisma.application.create.mockRejectedValue(dupErr);
    await expect(service.apply(42, 7)).rejects.toBeInstanceOf(ConflictException);
    expect(fakeQuota.consume).not.toHaveBeenCalled();
  });

  it('rolls back the Application row when quota.consume throws 429', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ emailVerified: true, email: 'cand@example.com' });
    mockedPrisma.job.findUnique.mockResolvedValue({ status: 'ACTIVE', title: 'SE', canonicalSlug: 'se-1', company: { name: 'Acme' } });
    mockedPrisma.application.create.mockResolvedValue({
      id: 99,
      userId: 42,
      jobId: 7,
      status: 'APPLIED',
      appliedAt: new Date(),
    });
    mockedPrisma.application.delete.mockResolvedValue({});
    fakeQuota.consume.mockRejectedValueOnce(new Error('429 race'));
    await expect(service.apply(42, 7)).rejects.toThrow('429 race');
    expect(mockedPrisma.application.delete).toHaveBeenCalledWith({ where: { id: 99 } });
  });
});

describe('ApplicationsService.list', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEmail.enqueueApplicationSubmitted.mockResolvedValue(undefined);
    fakeEmail.enqueueApplicationStatusChange.mockResolvedValue(undefined);
    fakeQuota.consume.mockResolvedValue({
      count: 1,
      limit: 10,
      unlimited: false,
      upgradeAvailable: false,
    });
    fakeNotifications.notifyNewApplication.mockResolvedValue(undefined);
    service = new ApplicationsService(
      fakeEmail as unknown as never,
      fakeQuota as unknown as never,
      fakeNotifications as unknown as never,
    );
  });

  it('paginates with default page=1, status=ALL', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    mockedPrisma.application.groupBy.mockResolvedValue([]);
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
    mockedPrisma.application.groupBy.mockResolvedValue([]);
    await service.list(42, { status: 'OFFERED', page: 2 });
    expect(mockedPrisma.application.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 42, status: 'OFFERED' },
      skip: 20,
    });
  });

  it('treats status=ALL as no narrowing', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    mockedPrisma.application.groupBy.mockResolvedValue([]);
    await service.list(42, { status: 'ALL' });
    const callArgs = mockedPrisma.application.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(callArgs.where).toEqual({ userId: 42 });
  });
});

describe('ApplicationsService.withdraw', () => {
  let service: ApplicationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEmail.enqueueApplicationSubmitted.mockResolvedValue(undefined);
    fakeEmail.enqueueApplicationStatusChange.mockResolvedValue(undefined);
    fakeQuota.consume.mockResolvedValue({
      count: 1,
      limit: 10,
      unlimited: false,
      upgradeAvailable: false,
    });
    fakeNotifications.notifyNewApplication.mockResolvedValue(undefined);
    service = new ApplicationsService(
      fakeEmail as unknown as never,
      fakeQuota as unknown as never,
      fakeNotifications as unknown as never,
    );
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
    expect(fakeEmail.enqueueApplicationStatusChange).toHaveBeenCalledWith(
      'me@example.com',
      42,
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

describe('ApplicationsService.list — additive fields (ADR 0002 step 10)', () => {
  let service: ApplicationsService;

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 1,
      status: 'APPLIED',
      appliedAt: new Date('2026-07-30T09:15:00Z'),
      updatedAt: new Date('2026-08-04T11:02:00Z'),
      statusHistory: null,
      job: {
        id: 88,
        title: 'T',
        canonicalSlug: 't-88',
        status: 'ACTIVE',
        company: { id: 5, name: 'Acme', slug: 'acme' },
      },
      ...over,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ApplicationsService(
      fakeEmail as unknown as never,
      fakeQuota as unknown as never,
      fakeNotifications as unknown as never,
    );
    mockedPrisma.application.findMany.mockResolvedValue([]);
    mockedPrisma.application.count.mockResolvedValue(0);
    mockedPrisma.application.groupBy.mockResolvedValue([]);
  });

  it('counts are UNFILTERED even when the page is narrowed by status', async () => {
    // They drive the filter chips. Deriving them from the filtered page would
    // make every chip show the count of whichever filter is already active.
    // ARGUMENT-SENSITIVE on purpose. A fixed mockResolvedValue returns the
    // same array however it is called, so `out.counts` would look identical
    // whether or not the implementation leaked the filter into groupBy — the
    // value assertion below would prove nothing.
    mockedPrisma.application.groupBy.mockImplementation((args: { where: { status?: string } }) =>
      Promise.resolve(
        args.where.status
          ? [{ status: 'REJECTED', _count: { _all: 2 } }]
          : [
              { status: 'APPLIED', _count: { _all: 3 } },
              { status: 'REJECTED', _count: { _all: 2 } },
            ],
      ),
    );
    const out = await service.list(42, { status: 'REJECTED' });

    const groupByArgs = mockedPrisma.application.groupBy.mock.calls[0]?.[0];
    expect(groupByArgs.by).toEqual(['status']);
    // EXACT, not toMatchObject: that is a recursive SUBSET match, so
    // `{ userId: 42, status: 'REJECTED' }` would satisfy `{ userId: 42 }` and
    // this test would pass for the very bug it is named after.
    expect(groupByArgs.where).toEqual({ userId: 42 });
    // the page IS narrowed...
    expect(mockedPrisma.application.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 42, status: 'REJECTED' },
    });
    // ...while the counts are not
    expect(out.counts).toEqual({ APPLIED: 3, REJECTED: 2, ALL: 5 });
  });

  it('ALL is the sum, and zero-count statuses are omitted', async () => {
    mockedPrisma.application.groupBy.mockResolvedValue([
      { status: 'APPLIED', _count: { _all: 1 } },
      { status: 'HIRED', _count: { _all: 2 } },
    ]);
    const out = await service.list(42, {});
    // The exact toEqual above already pins the key set; asserting the absence
    // of WITHDRAWN separately would only restate the fixture.
    expect(out.counts).toEqual({ APPLIED: 1, HIRED: 2, ALL: 3 });
  });

  it('reports ALL: 0 for a user with no applications', async () => {
    const out = await service.list(42, {});
    expect(out.counts).toEqual({ ALL: 0 });
  });

  it('scopes the counts query to the caller — never another user', async () => {
    await service.list(7, {});
    expect(mockedPrisma.application.groupBy.mock.calls[0]?.[0].where).toEqual({ userId: 7 });
  });

  it('coalesces a null statusHistory to [] so the client never null-checks', async () => {
    mockedPrisma.application.findMany.mockResolvedValue([row({ statusHistory: null })]);
    mockedPrisma.application.count.mockResolvedValue(1);
    expect((await service.list(42, {})).hits[0]?.statusHistory).toEqual([]);
  });

  it('passes a real history through untouched, oldest first', async () => {
    const history = [
      { from: 'APPLIED', to: 'IN_REVIEW', at: '2026-08-01T08:00:00.000Z', by: 'RECRUITER' },
      { from: 'IN_REVIEW', to: 'SHORTLISTED', at: '2026-08-04T11:02:00.000Z', by: 'RECRUITER' },
    ];
    mockedPrisma.application.findMany.mockResolvedValue([row({ statusHistory: history })]);
    mockedPrisma.application.count.mockResolvedValue(1);
    expect((await service.list(42, {})).hits[0]?.statusHistory).toEqual(history);
  });

  it('treats a non-array statusHistory as no history rather than shipping it', async () => {
    // The column is Json?, so the schema permits shapes nothing writes.
    mockedPrisma.application.findMany.mockResolvedValue([row({ statusHistory: { bad: true } })]);
    mockedPrisma.application.count.mockResolvedValue(1);
    expect((await service.list(42, {})).hits[0]?.statusHistory).toEqual([]);
  });

  it('selects statusHistory without disturbing the existing projection', async () => {
    await service.list(42, {});
    const select = mockedPrisma.application.findMany.mock.calls[0]?.[0].select;
    expect(select.statusHistory).toBe(true);
    // the pre-existing fields are all still there
    expect(select.id).toBe(true);
    expect(select.status).toBe(true);
    expect(select.appliedAt).toBe(true);
    expect(select.updatedAt).toBe(true);
    expect(select.job).toBeDefined();
  });

  it('leaves total as the FILTERED count — counts and total mean different things', async () => {
    mockedPrisma.application.count.mockResolvedValue(1);
    mockedPrisma.application.groupBy.mockResolvedValue([
      { status: 'APPLIED', _count: { _all: 7 } },
    ]);
    const out = await service.list(42, { status: 'APPLIED' });
    expect(out.total).toBe(1);
    expect(out.counts.ALL).toBe(7);
  });
});
