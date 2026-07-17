import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
      deleteMany: vi.fn(),
    },
    locality: { findUnique: vi.fn(), upsert: vi.fn() },
    city: { findUnique: vi.fn() },
    candidate: { count: vi.fn() },
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
    deleteMany: ReturnType<typeof vi.fn>;
  };
  locality: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  city: { findUnique: ReturnType<typeof vi.fn> };
  candidate: { count: ReturnType<typeof vi.fn> };
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

const MODERATION_FLAG = 'moderation.jobs.enabled';
const POST_JOB_KILLSWITCH = 'killswitch.recruiter_post_job';

describe('RecruiterJobsService', () => {
  let service: RecruiterJobsService;
  // Key-aware flag mock: create() reads BOTH the killswitch and the moderation
  // flag, so a positional mockResolvedValueOnce is order-fragile. Each test
  // sets only the flags it cares about; everything else defaults to OFF.
  let flagState: Record<string, boolean>;

  beforeEach(() => {
    vi.resetAllMocks();
    flagState = {};
    mockedFlag.mockImplementation(async (key: string) => flagState[key] === true);
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
      // killswitch + moderation both default OFF
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
      flagState[MODERATION_FLAG] = true; // moderation ON (killswitch stays OFF)
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
      // moderation flag never read for drafts (the killswitch IS checked first)
      expect(mockedFlag).not.toHaveBeenCalledWith(MODERATION_FLAG);
      await Promise.resolve();
      expect(mockedSync).not.toHaveBeenCalled();
    });

    it('quota race throws → service propagates the 429 (no row created)', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      fakeQuota.consume.mockRejectedValue(new Error('429 race'));
      await expect(service.create(42, validInput)).rejects.toThrow('429 race');
      expect(mocked.job.create).not.toHaveBeenCalled();
    });

    // --- L3 killswitch (killswitch.recruiter_post_job) ----------------------

    it('killswitch ON → publish rejects 503, no quota consumed, no row created', async () => {
      flagState[POST_JOB_KILLSWITCH] = true;
      await expect(service.create(42, validInput)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(mocked.recruiter.findUnique).not.toHaveBeenCalled();
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mocked.job.create).not.toHaveBeenCalled();
    });

    it('killswitch ON → draft is also blocked with 503 (no row created)', async () => {
      flagState[POST_JOB_KILLSWITCH] = true;
      await expect(
        service.create(42, { ...validInput, publishMode: 'DRAFT' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mocked.job.create).not.toHaveBeenCalled();
    });

    // --- Phase 3 fields: jobType + locality ---------------------------------

    it('persists jobType, openings, and qualifications in the create data', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mocked.job.create.mockResolvedValue({ id: 200, status: 'DRAFT', canonicalSlug: 'p' });
      mocked.job.update.mockResolvedValue({ id: 200, status: 'DRAFT', canonicalSlug: 's-200' });

      await service.create(42, {
        ...validInput,
        publishMode: 'DRAFT',
        jobType: 'HOT_VACANCY',
        openings: 3,
        qualifications: 'B.Tech required',
      });

      const data = mocked.job.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.jobType).toBe('HOT_VACANCY');
      expect(data.openings).toBe(3);
      expect(data.qualifications).toBe('B.Tech required');
      expect(data.localityId).toBeNull();
    });

    it('localityName find-or-creates a City-scoped locality and links it', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mocked.city.findUnique.mockResolvedValue({ slug: 'bangalore' });
      mocked.locality.upsert.mockResolvedValue({ id: 55 });
      mocked.job.create.mockResolvedValue({ id: 201, status: 'DRAFT', canonicalSlug: 'p' });
      mocked.job.update.mockResolvedValue({ id: 201, status: 'DRAFT', canonicalSlug: 's-201' });

      await service.create(42, {
        ...validInput,
        publishMode: 'DRAFT',
        primaryCityId: 7,
        localityName: 'Koramangala',
      });

      expect(mocked.locality.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'bangalore-koramangala' },
          create: expect.objectContaining({ name: 'Koramangala', cityId: 7 }),
        }),
      );
      const data = mocked.job.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.localityId).toBe(55);
    });

    it('rejects a localityId that belongs to a different city (400, no row)', async () => {
      mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7, workEmailVerified: true });
      mocked.locality.findUnique.mockResolvedValue({ id: 9, cityId: 99 });

      await expect(
        service.create(42, { ...validInput, primaryCityId: 7, localityId: 9 }),
      ).rejects.toBeInstanceOf(BadRequestException);
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

  describe('publish (DRAFT → ACTIVE)', () => {
    // A fully-completed draft: has every publish-mandatory field.
    const completeDraft = {
      id: 5,
      postedById: 42,
      status: 'DRAFT' as const,
      canonicalSlug: 'foo-5',
      title: 'Senior Frontend Engineer',
      description: 'Build the dashboard. ' + 'a'.repeat(50),
      functionalAreaId: 3,
      openings: 2,
      primaryCityId: 1,
    };

    it('killswitch ON → ServiceUnavailableException before any DB work / consume', async () => {
      flagState[POST_JOB_KILLSWITCH] = true;
      await expect(service.publish(42, 5)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mocked.job.findUnique).not.toHaveBeenCalled();
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mocked.job.update).not.toHaveBeenCalled();
    });

    it("teammate's job → NotFoundException (ownership, no consume/update)", async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 5, postedById: 99, status: 'DRAFT' });
      await expect(service.publish(42, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mocked.job.update).not.toHaveBeenCalled();
    });

    it('non-DRAFT job (already ACTIVE) → BadRequestException, no consume/update', async () => {
      mocked.job.findUnique.mockResolvedValue({ ...completeDraft, status: 'ACTIVE' });
      await expect(service.publish(42, 5)).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mocked.job.update).not.toHaveBeenCalled();
    });

    it('DRAFT missing required fields → BadRequestException BEFORE consuming a slot', async () => {
      mocked.job.findUnique.mockResolvedValue({
        ...completeDraft,
        functionalAreaId: null,
        primaryCityId: null,
        openings: null,
      });
      await expect(service.publish(42, 5)).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeQuota.consume).not.toHaveBeenCalled();
      expect(mocked.job.update).not.toHaveBeenCalled();
    });

    it('complete DRAFT + moderation OFF → ACTIVE + quota consumed + ES/alerts/purge/email', async () => {
      mocked.job.findUnique.mockResolvedValue(completeDraft);
      mocked.job.update.mockResolvedValue({ ...completeDraft, status: 'ACTIVE' });

      const out = await service.publish(42, 5);

      expect(out.status).toBe('ACTIVE');
      expect(fakeQuota.consume).toHaveBeenCalledWith(42);
      // update flips status AND refreshes postedAt to the go-live moment
      const data = mocked.job.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.status).toBe('ACTIVE');
      expect(data.postedAt).toBeInstanceOf(Date);
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(5, 'index');
      expect(fakeAlertsHook.onJobIndexed).toHaveBeenCalledWith(5);
      expect(fakeCachePurge.purgeJob).toHaveBeenCalledWith('foo-5');
      expect(fakeEmail.enqueueJobPostedConfirmation).toHaveBeenCalled();
    });

    it('complete DRAFT + moderation ON → PENDING_MODERATION + consumed + NO side effects', async () => {
      flagState[MODERATION_FLAG] = true;
      mocked.job.findUnique.mockResolvedValue(completeDraft);
      mocked.job.update.mockResolvedValue({ ...completeDraft, status: 'PENDING_MODERATION' });

      const out = await service.publish(42, 5);

      expect(out.status).toBe('PENDING_MODERATION');
      expect(fakeQuota.consume).toHaveBeenCalledWith(42); // still reserves the slot
      await Promise.resolve();
      expect(mockedSync).not.toHaveBeenCalled();
      expect(fakeAlertsHook.onJobIndexed).not.toHaveBeenCalled();
      expect(fakeCachePurge.purgeJob).not.toHaveBeenCalled();
      expect(fakeEmail.enqueueJobPostedConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    const JOB_DELETE_KILLSWITCH = 'killswitch.recruiter_job_delete';

    it('killswitch ON → ServiceUnavailableException before any DB work', async () => {
      flagState[JOB_DELETE_KILLSWITCH] = true;
      await expect(service.delete(42, 5)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mocked.job.findUnique).not.toHaveBeenCalled();
      expect(mocked.job.deleteMany).not.toHaveBeenCalled();
    });

    it("teammate's job → NotFoundException (ownership, no leak)", async () => {
      mocked.job.findUnique.mockResolvedValue({ id: 5, postedById: 99 });
      await expect(service.delete(42, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(mocked.job.deleteMany).not.toHaveBeenCalled();
    });

    it('job with applications → ConflictException, nothing deleted, no side effects', async () => {
      mocked.job.findUnique.mockResolvedValue({
        id: 5,
        postedById: 42,
        status: 'ACTIVE',
        canonicalSlug: 'foo-5',
      });
      // The atomic `applications: none` guard matched no row (job still exists
      // → the second findUnique disambiguation returns it → 409).
      mocked.job.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.delete(42, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(mockedSync).not.toHaveBeenCalled();
      expect(fakeCachePurge.purgeJob).not.toHaveBeenCalled();
    });

    it('row vanished in a concurrent delete → NotFoundException, not a misleading 409', async () => {
      mocked.job.findUnique
        .mockResolvedValueOnce({ id: 5, postedById: 42, status: 'DRAFT', canonicalSlug: 'foo-5' })
        .mockResolvedValueOnce(null); // gone by the time deleteMany ran
      mocked.job.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.delete(42, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockedSync).not.toHaveBeenCalled();
    });

    it('own job with zero applications → deleted + ES remove + cache purge', async () => {
      mocked.job.findUnique.mockResolvedValue({
        id: 5,
        postedById: 42,
        status: 'DRAFT',
        canonicalSlug: 'foo-5',
      });
      mocked.job.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.delete(42, 5)).resolves.toBeUndefined();
      const args = mocked.job.deleteMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(args.where).toMatchObject({
        id: 5,
        postedById: 42,
        applications: { none: {} },
      });
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(5, 'remove');
      expect(fakeCachePurge.purgeJob).toHaveBeenCalledWith('foo-5');
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

  describe('salaryTrends (Phase 4)', () => {
    it('returns null when fewer than 3 matching jobs', async () => {
      mocked.job.findMany.mockResolvedValue([{ salaryMinPaise: 1, salaryMaxPaise: 2 }]);
      await expect(service.salaryTrends({ title: 'Engineer', cityId: 1 })).resolves.toBeNull();
    });

    it('computes min/median/max in LPA from job midpoints', async () => {
      const L = (lpa: number) => lpa * 100_000 * 100;
      mocked.job.findMany.mockResolvedValue([
        { salaryMinPaise: L(10), salaryMaxPaise: L(10) },
        { salaryMinPaise: L(20), salaryMaxPaise: L(20) },
        { salaryMinPaise: L(30), salaryMaxPaise: L(30) },
      ]);
      await expect(service.salaryTrends({ title: 'Engineer' })).resolves.toEqual({
        count: 3,
        minLpa: 10,
        medianLpa: 20,
        maxLpa: 30,
      });
    });
  });

  describe('reach (Phase 4)', () => {
    it('returns 0 without hitting the DB when no skills or city given', async () => {
      await expect(service.reach({})).resolves.toEqual({ count: 0 });
      expect(mocked.candidate.count).not.toHaveBeenCalled();
    });

    it('counts candidates by skill overlap + preferred city', async () => {
      mocked.candidate.count.mockResolvedValue(7);
      await expect(service.reach({ skillIds: '3,5', cityId: 1 })).resolves.toEqual({ count: 7 });
      const where = mocked.candidate.count.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where.skillIds).toEqual({ hasSome: [3, 5] });
      expect(where.preferredCityIds).toEqual({ has: 1 });
    });
  });
});
