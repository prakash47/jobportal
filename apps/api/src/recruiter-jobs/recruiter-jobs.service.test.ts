import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('@jobportal/search', () => ({
  syncJob: vi.fn().mockResolvedValue(undefined),
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { RecruiterJobsService } from './recruiter-jobs.service';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
const mockedSync = syncJob as ReturnType<typeof vi.fn>;
const mocked = prisma as unknown as {
  recruiter: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  job: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeQuota = {
  consume: vi.fn(),
} as { consume: ReturnType<typeof vi.fn> };

const fakeAlertsHook = {
  onJobIndexed: vi.fn(),
} as { onJobIndexed: ReturnType<typeof vi.fn> };

const fakeCachePurge = {
  purgeJob: vi.fn(),
} as { purgeJob: ReturnType<typeof vi.fn> };

const fakeEmail = {
  enqueueJobPostedConfirmation: vi.fn().mockResolvedValue(undefined),
} as { enqueueJobPostedConfirmation: ReturnType<typeof vi.fn> };

const validInput = {
  publishMode: 'PUBLISH' as const,
  title: 'Senior Frontend Engineer',
  description: 'Build the dashboard. ' + 'a'.repeat(50),
};

describe('RecruiterJobsService', () => {
  let service: RecruiterJobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeQuota.consume.mockResolvedValue({});
    fakeAlertsHook.onJobIndexed.mockResolvedValue(undefined);
    fakeCachePurge.purgeJob.mockResolvedValue(undefined);
    fakeEmail.enqueueJobPostedConfirmation.mockResolvedValue(undefined);
    mockedSync.mockResolvedValue(undefined);
    mocked.user.findUnique.mockResolvedValue({ email: 'recruiter@acme.com' });
    mocked.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    service = new RecruiterJobsService(
      fakeQuota as unknown as never,
      fakeAlertsHook as unknown as never,
      fakeCachePurge as unknown as never,
      fakeEmail as unknown as never,
    );
  });

  describe('create', () => {
    it('rejects when the recruiter has not verified their work email', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({
        companyId: 7,
        workEmailVerified: false,
      });
      await expect(service.create(42, validInput)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fakeQuota.consume).not.toHaveBeenCalled();
    });

    it('rejects when no Recruiter row exists for the user', async () => {
      mocked.recruiter.findUnique.mockResolvedValue(null);
      await expect(service.create(42, validInput)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publish + moderation OFF → status=ACTIVE + ES sync + alerts hook + cache purge', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mockedFlag.mockResolvedValueOnce(false); // moderation flag
      mocked.job.create.mockResolvedValue({
        id: 100,
        title: 'Senior Frontend Engineer',
        status: 'ACTIVE',
        canonicalSlug: 'job-pending-x',
        companyId: 7,
        postedById: 42,
      });
      mocked.job.update.mockResolvedValue({
        id: 100,
        title: 'Senior Frontend Engineer',
        status: 'ACTIVE',
        canonicalSlug: 'senior-frontend-engineer-100',
        companyId: 7,
        postedById: 42,
      });

      const out = await service.create(42, validInput);

      expect(out.status).toBe('ACTIVE');
      expect(out.canonicalSlug).toBe('senior-frontend-engineer-100');
      expect(fakeQuota.consume).toHaveBeenCalledWith(42);
      // Side effects fire-and-log; await a tick for the .catch handlers to attach
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(100, 'index');
      expect(fakeAlertsHook.onJobIndexed).toHaveBeenCalledWith(100);
      expect(fakeCachePurge.purgeJob).toHaveBeenCalledWith('senior-frontend-engineer-100');
    });

    it('publish + moderation ON → status=PENDING_MODERATION + NO ES/alert/purge', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mockedFlag.mockResolvedValueOnce(true); // moderation ON
      mocked.job.create.mockResolvedValue({
        id: 101,
        status: 'PENDING_MODERATION',
        canonicalSlug: 'placeholder',
      });
      mocked.job.update.mockResolvedValue({
        id: 101,
        status: 'PENDING_MODERATION',
        canonicalSlug: 'senior-frontend-engineer-101',
      });

      const out = await service.create(42, validInput);
      expect(out.status).toBe('PENDING_MODERATION');
      expect(fakeQuota.consume).toHaveBeenCalledWith(42); // still consumed
      await Promise.resolve();
      expect(mockedSync).not.toHaveBeenCalled();
      expect(fakeAlertsHook.onJobIndexed).not.toHaveBeenCalled();
      expect(fakeCachePurge.purgeJob).not.toHaveBeenCalled();
    });

    it('DRAFT skips quota.consume and skips all side effects', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mocked.job.create.mockResolvedValue({ id: 102, status: 'DRAFT', canonicalSlug: 'p' });
      mocked.job.update.mockResolvedValue({
        id: 102,
        status: 'DRAFT',
        canonicalSlug: 'senior-frontend-engineer-102',
      });

      const out = await service.create(42, { ...validInput, publishMode: 'DRAFT' });
      expect(out.status).toBe('DRAFT');
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mockedFlag).not.toHaveBeenCalled(); // moderation flag never read for drafts
      await Promise.resolve();
      expect(mockedSync).not.toHaveBeenCalled();
    });

    it('quota race throws → service propagates the 429 (no row created)', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mockedFlag.mockResolvedValueOnce(false);
      fakeQuota.consume.mockRejectedValue(new Error('429 race'));
      await expect(service.create(42, validInput)).rejects.toThrow('429 race');
      expect(mocked.job.create).not.toHaveBeenCalled();
    });
  });

  describe('getOne ownership', () => {
    it('throws NotFoundException for a job posted by another user (no leak)', async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 1, postedById: 99 });
      await expect(service.getOne(42, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the job for the owning recruiter', async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 1, postedById: 42 });
      await expect(service.getOne(42, 1)).resolves.toMatchObject({ id: 1 });
    });
  });

  describe('close + reopen', () => {
    it('close on ACTIVE → status=CLOSED + ES remove + cache purge', async () => {
      mocked.job.findUnique.mockResolvedValue({
        id: 5,
        postedById: 42,
        status: 'ACTIVE',
        canonicalSlug: 'foo-5',
      });
      mocked.job.update.mockResolvedValue({
        id: 5,
        status: 'CLOSED',
        canonicalSlug: 'foo-5',
      });
      const out = await service.close(42, 5);
      expect(out.status).toBe('CLOSED');
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(5, 'remove');
      expect(fakeCachePurge.purgeJob).toHaveBeenCalledWith('foo-5');
    });

    it('close on DRAFT → BadRequestException', async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 5, postedById: 42, status: 'DRAFT' });
      await expect(service.close(42, 5)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('close on already-CLOSED is idempotent', async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 5, postedById: 42, status: 'CLOSED' });
      const out = await service.close(42, 5);
      expect(out.status).toBe('CLOSED');
      expect(mocked.job.update).not.toHaveBeenCalled();
    });

    it('reopen on CLOSED → status=ACTIVE + ES sync + alerts hook', async () => {
      mocked.job.findUnique.mockResolvedValue({
        id: 5,
        postedById: 42,
        status: 'CLOSED',
        canonicalSlug: 'foo-5',
      });
      mocked.job.update.mockResolvedValue({
        id: 5,
        status: 'ACTIVE',
        canonicalSlug: 'foo-5',
      });
      const out = await service.reopen(42, 5);
      expect(out.status).toBe('ACTIVE');
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(5, 'index');
      expect(fakeAlertsHook.onJobIndexed).toHaveBeenCalledWith(5);
    });

    it('reopen on DRAFT → BadRequestException', async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 5, postedById: 42, status: 'DRAFT' });
      await expect(service.reopen(42, 5)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list', () => {
    it('scopes by postedById and applies status filter', async () => {
      mocked.job.findMany.mockResolvedValue([]);
      mocked.job.count.mockResolvedValue(0);
      await service.list(42, { status: 'ACTIVE', page: 2 });
      const args = mocked.job.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(args.where).toMatchObject({ postedById: 42, status: 'ACTIVE' });
    });

    it('treats status=ALL as no narrowing', async () => {
      mocked.job.findMany.mockResolvedValue([]);
      mocked.job.count.mockResolvedValue(0);
      await service.list(42, { status: 'ALL' });
      const args = mocked.job.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(args.where).toEqual({ postedById: 42 });
    });
  });
});
