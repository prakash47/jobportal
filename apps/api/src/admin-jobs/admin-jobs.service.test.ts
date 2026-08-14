import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// remove() consults killswitch.admin_job_delete before doing anything. Mocked at
// module scope so the delete tests can drive both sides of it without a real
// flag store; every other method in this service ignores flags entirely.
vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));

vi.mock('@jobportal/db', () => ({
  prisma: {
    job: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    skill: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    city: { findMany: vi.fn() },
    companyKyc: { findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminJobsService } from './admin-jobs.service';

const flagEnabled = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;

const m = prisma as unknown as {
  job: {
    count: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  skill: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
  city: { findMany: ReturnType<typeof vi.fn> };
  companyKyc: { findUnique: ReturnType<typeof vi.fn> };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeEffects = {
  firePublishSideEffects: vi.fn(),
  fireRemoveSideEffects: vi.fn(),
  fireJobPostedEmail: vi.fn().mockResolvedValue(undefined),
};
const fakeQuota = { refund: vi.fn().mockResolvedValue(undefined) };
const fakeNotifications = { notifyJobModerationDecision: vi.fn().mockResolvedValue(undefined) };

const ADMIN = 900;
const JOB = 123;

// prisma.job.findUnique serves BOTH the narrow `select` moderate() opens with
// and the wide `include` getJobDetail uses for the return value, so the fixture
// carries the union of the two shapes.
function pendingJob(over: Record<string, unknown> = {}) {
  return {
    id: JOB,
    status: 'PENDING_MODERATION',
    title: 'Senior Frontend Engineer',
    canonicalSlug: 'senior-frontend-engineer-123',
    postedById: 42,
    expiresAt: null,
    companyId: 7,
    skillIds: [],
    cityIds: [],
    // True for the paths that actually spent a slot (create(PUBLISH), publish()).
    // reopen() produces a pending job with this false — see the refund tests.
    postQuotaConsumed: true,
    ...over,
  };
}

// The row re-read after the flip, handed to the side effects.
function decidedJob(over: Record<string, unknown> = {}) {
  return { ...pendingJob(), status: 'ACTIVE', ...over };
}

describe('AdminJobsService', () => {
  let service: AdminJobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEffects.fireJobPostedEmail.mockResolvedValue(undefined);
    fakeQuota.refund.mockResolvedValue(undefined);
    fakeNotifications.notifyJobModerationDecision.mockResolvedValue(undefined);
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    // Killswitches are seeded OFF, so the default here is "the action is live".
    flagEnabled.mockResolvedValue(false);
    m.job.deleteMany.mockResolvedValue({ count: 1 });
    m.job.updateMany.mockResolvedValue({ count: 1 });
    m.job.findUniqueOrThrow.mockResolvedValue(decidedJob());
    // getJobDetail, called for the return value.
    m.job.findUnique.mockResolvedValue(pendingJob());
    m.skill.findMany.mockResolvedValue([]);
    m.user.findMany.mockResolvedValue([]);
    m.city.findMany.mockResolvedValue([]);
    m.companyKyc.findUnique.mockResolvedValue(null);

    service = new AdminJobsService(
      fakeEffects as unknown as never,
      fakeQuota as unknown as never,
      fakeNotifications as unknown as never,
    );
  });

  describe('listJobs', () => {
    beforeEach(() => {
      m.job.findMany.mockResolvedValue([]);
      m.job.count.mockResolvedValue(0);
    });

    it('defaults to the jobs actually awaiting a decision', async () => {
      await service.listJobs({});
      expect(m.job.findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { status: 'PENDING_MODERATION' },
      });
    });

    // Filtering the "decided" view on JobStatus would be a lie: ACTIVE is every
    // live job on the platform, almost none of which was ever moderated. Only a
    // non-null reviewedAt means a human actually ruled on it.
    it('scopes the decided view to jobs a human actually ruled on', async () => {
      await service.listJobs({ view: 'decided' });
      expect(m.job.findMany.mock.calls[0]?.[0].where).toEqual({ reviewedAt: { not: null } });
      expect(m.job.count.mock.calls[0]?.[0].where).toEqual({ reviewedAt: { not: null } });
    });

    it('hydrates the reviewer, tolerating a deleted admin account', async () => {
      m.job.findMany.mockResolvedValue([
        { id: 1, reviewedById: 900 },
        { id: 2, reviewedById: 901 },
        { id: 3, reviewedById: null },
      ]);
      // 901 no longer exists — reviewedById has no FK, so this is reachable.
      m.user.findMany.mockResolvedValue([{ id: 900, name: 'Admin', email: 'a@x.in' }]);

      const out = (await service.listJobs({ view: 'decided' })) as {
        hits: { id: number; reviewedBy: { name: string } | null }[];
      };

      expect(out.hits[0]?.reviewedBy).toMatchObject({ name: 'Admin' });
      expect(out.hits[1]?.reviewedBy).toBeNull();
      expect(out.hits[2]?.reviewedBy).toBeNull();
    });

    it('does not query for reviewers when no row has one', async () => {
      m.job.findMany.mockResolvedValue([{ id: 1, reviewedById: null }]);
      await service.listJobs({});
      expect(m.user.findMany).not.toHaveBeenCalled();
    });

    // A review queue is FIFO: the job that has waited longest is worked next.
    // It must sort on submittedForReviewAt, NOT postedAt — reopen() returns a
    // previously-live job to the queue without touching postedAt, so a job
    // reopened today can carry a months-old postedAt and would jump the queue.
    it('orders the pending queue by when jobs entered review, not by postedAt', async () => {
      await service.listJobs({});
      expect(m.job.findMany.mock.calls[0]?.[0].orderBy).toEqual([
        { submittedForReviewAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    // "What just happened" wants the most recent decision first — not the most
    // recently posted job, which is unrelated to when anyone ruled on it.
    it('orders the decided view by most recent decision', async () => {
      await service.listJobs({ view: 'decided' });
      expect(m.job.findMany.mock.calls[0]?.[0].orderBy).toEqual([
        { reviewedAt: 'desc' },
        { id: 'desc' },
      ]);
    });
  });

  describe('moderate', () => {
    it('404s an unknown job', async () => {
      m.job.findUnique.mockResolvedValueOnce(null);
      await expect(service.moderate(ADMIN, JOB, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // Guards against an admin "approving" something that was never in review —
    // e.g. a stale browser tab pointed at a job that has since been decided.
    it('rejects a job that is not awaiting review', async () => {
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ status: 'ACTIVE' }));
      await expect(service.moderate(ADMIN, JOB, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.job.updateMany).not.toHaveBeenCalled();
    });

    it('APPROVE → ACTIVE, refreshes postedAt, and replays the publish side effects', async () => {
      await service.moderate(ADMIN, JOB, { decision: 'APPROVE' });

      const call = m.job.updateMany.mock.calls[0]?.[0];
      expect(call.where).toEqual({ id: JOB, status: 'PENDING_MODERATION' });
      expect(call.data.status).toBe('ACTIVE');
      expect(call.data.reviewedById).toBe(ADMIN);
      // postedAt means "reached the market" — approval is that moment.
      expect(call.data.postedAt).toBeInstanceOf(Date);
      expect(call.data.rejectionReason).toBeNull();

      expect(fakeEffects.firePublishSideEffects).toHaveBeenCalledOnce();
      expect(fakeEffects.fireJobPostedEmail).toHaveBeenCalledWith(42, expect.anything());
      // Approval is not a refund event — the recruiter got their live job.
      expect(fakeQuota.refund).not.toHaveBeenCalled();
    });

    // A job can sit in review past its own expiry: the nightly sweep only looks
    // at ACTIVE rows, so nothing clears it while pending. Approving without
    // clearing would put the job live and let the next sweep expire it again,
    // with the recruiter's quota already spent.
    it('APPROVE clears an expiry that has already passed', async () => {
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ expiresAt: new Date('2020-01-01') }));
      await service.moderate(ADMIN, JOB, { decision: 'APPROVE' });
      expect(m.job.updateMany.mock.calls[0]?.[0].data.expiresAt).toBeNull();
    });

    it('APPROVE leaves a future expiry alone', async () => {
      const future = new Date(Date.now() + 86_400_000);
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ expiresAt: future }));
      await service.moderate(ADMIN, JOB, { decision: 'APPROVE' });
      expect(m.job.updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('expiresAt');
    });

    it('REJECT → DRAFT with the reason, and never indexes the job', async () => {
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Salary looks wrong' });

      const call = m.job.updateMany.mock.calls[0]?.[0];
      expect(call.data.status).toBe('DRAFT');
      expect(call.data.rejectionReason).toBe('Salary looks wrong');
      // Sending a job back must never publish it.
      expect(fakeEffects.firePublishSideEffects).not.toHaveBeenCalled();
      expect(fakeEffects.fireJobPostedEmail).not.toHaveBeenCalled();
      // ...but it must purge: a pending job's page is publicly cacheable, so
      // without this the refused content keeps being served from the edge.
      expect(fakeEffects.fireRemoveSideEffects).toHaveBeenCalledOnce();
      // postedAt must NOT move — the job never reached the market.
      expect(call.data).not.toHaveProperty('postedAt');
    });

    it('REJECT refunds the post slot when one was actually consumed', async () => {
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ postQuotaConsumed: true }));
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Nope' });
      expect(fakeQuota.refund).toHaveBeenCalledWith(42);
    });

    // Not every route into review spends a slot. reopen() puts a previously-live
    // job back into the queue and deliberately does NOT consume, so refunding
    // here would hand back something that was never taken — reopen → reject
    // would mint a free post, farmable once per closed job the recruiter owns.
    it('REJECT does NOT refund a job that reached review without consuming a slot', async () => {
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ postQuotaConsumed: false }));
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Nope' });
      expect(fakeQuota.refund).not.toHaveBeenCalled();
    });

    // Whichever way it goes, the job stops holding a slot: spent on approval,
    // handed back on rejection. Leaving it true would let a later decision on a
    // re-submitted job refund twice.
    it.each([
      ['APPROVE', undefined],
      ['REJECT', 'Nope'],
    ])('%s settles the quota flag', async (decision, reason) => {
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, {
        decision: decision as 'APPROVE' | 'REJECT',
        ...(reason ? { reason } : {}),
      });
      expect(m.job.updateMany.mock.calls[0]?.[0].data.postQuotaConsumed).toBe(false);
    });

    // Two admins hitting Approve both pass the status read; only the one whose
    // guarded updateMany matches a still-PENDING row may act.
    it('409s the loser of a concurrent decision without any side effects', async () => {
      m.job.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.moderate(ADMIN, JOB, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(fakeEffects.firePublishSideEffects).not.toHaveBeenCalled();
      expect(fakeNotifications.notifyJobModerationDecision).not.toHaveBeenCalled();
      expect(fakeQuota.refund).not.toHaveBeenCalled();
    });

    it('writes the audit row inside the same transaction as the flip', async () => {
      await service.moderate(ADMIN, JOB, { decision: 'APPROVE' });
      expect(m.$transaction).toHaveBeenCalledOnce();
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.userId).toBe(ADMIN);
      expect(audit.action).toBe('JOB_APPROVED');
      expect(audit.diff.status).toEqual({ before: 'PENDING_MODERATION', after: 'ACTIVE' });
    });

    // Data-minimisation: the audit diff carries ids, the transition and the
    // admin's own reason — never the recruiter's copy.
    it('keeps the job title and description out of the audit diff', async () => {
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Duplicate posting' });
      const diff = JSON.stringify(m.profileAuditLog.create.mock.calls[0]?.[0].data.diff);
      expect(diff).not.toContain('Senior Frontend Engineer');
      expect(diff).toContain('Duplicate posting');
    });

    it('notifies the job owner of the decision', async () => {
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Needs detail' });
      expect(fakeNotifications.notifyJobModerationDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          recruiterUserId: 42,
          jobId: JOB,
          decision: 'REJECTED',
          rejectionReason: 'Needs detail',
        }),
      );
    });

    // Job.postedById is nullable (SetNull when a recruiter departs). An orphaned
    // job must still be reviewable rather than 500.
    it('handles a job whose poster has left the company', async () => {
      m.job.findUnique.mockResolvedValueOnce(pendingJob({ postedById: null }));
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ postedById: null }));
      await expect(service.moderate(ADMIN, JOB, { decision: 'APPROVE' })).resolves.toBeDefined();
      expect(fakeEffects.fireJobPostedEmail).not.toHaveBeenCalled();
      // The job still goes live — the posting belongs to the company.
      expect(fakeEffects.firePublishSideEffects).toHaveBeenCalledOnce();
    });

    // The decision has committed by the time these run; a failing notification
    // must not turn a successful review into a 500.
    it('still resolves when the notification producer rejects', async () => {
      fakeNotifications.notifyJobModerationDecision.mockRejectedValue(new Error('bell down'));
      await expect(service.moderate(ADMIN, JOB, { decision: 'APPROVE' })).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('rejects with 503 while the killswitch is on, before touching the database', async () => {
      flagEnabled.mockResolvedValue(true);
      await expect(service.remove(ADMIN, JOB)).rejects.toBeInstanceOf(ServiceUnavailableException);
      // The flag is the FIRST thing checked, so a killed delete costs no query
      // and — more importantly — cannot half-run.
      expect(m.job.findUnique).not.toHaveBeenCalled();
      expect(m.job.deleteMany).not.toHaveBeenCalled();
    });

    it('404s an unknown job', async () => {
      m.job.findUnique.mockResolvedValue(null);
      await expect(service.remove(ADMIN, JOB)).rejects.toBeInstanceOf(NotFoundException);
      expect(m.job.deleteMany).not.toHaveBeenCalled();
    });

    // The single most important assertion in this file. The guard must live in
    // the WHERE clause, because Application cascades on Job delete: a
    // count-then-delete would let an application arriving in between be
    // destroyed silently. If this assertion is ever relaxed, candidates lose
    // application history.
    it('guards the zero-application invariant inside the delete statement', async () => {
      await service.remove(ADMIN, JOB);
      expect(m.job.deleteMany).toHaveBeenCalledWith({
        where: { id: JOB, applications: { none: {} } },
      });
    });

    it('writes a JOB_DELETED audit row carrying ids but no job content', async () => {
      m.job.findUnique.mockResolvedValue(pendingJob({ status: 'DRAFT' }));
      await service.remove(ADMIN, JOB);

      const row = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(row).toMatchObject({
        userId: ADMIN,
        action: 'JOB_DELETED',
        diff: { jobId: JOB, status: 'DRAFT', companyId: 7, applicationCount: 0 },
      });
      // Minimisation: the recruiter's words never reach the audit log.
      expect(JSON.stringify(row.diff)).not.toContain('Senior Frontend Engineer');
    });

    // The audit row and the delete share one transaction, so a job cannot be
    // destroyed without a record of who destroyed it.
    it('writes the audit row inside the same transaction as the delete', async () => {
      await service.remove(ADMIN, JOB);
      expect(m.$transaction).toHaveBeenCalledOnce();
      expect(m.profileAuditLog.create).toHaveBeenCalledOnce();
    });

    it('409s when the job has applications, and does not audit', async () => {
      m.job.deleteMany.mockResolvedValue({ count: 0 });
      // Still present — so the zero count means the `applications: none` arm
      // failed, not that the row vanished.
      m.job.findUnique.mockResolvedValue(pendingJob());

      await expect(service.remove(ADMIN, JOB)).rejects.toBeInstanceOf(ConflictException);
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
      expect(fakeEffects.fireRemoveSideEffects).not.toHaveBeenCalled();
    });

    // Same zero count, opposite cause. Reporting "has applications" for a row
    // that simply vanished would send an admin looking for applicants that do
    // not exist.
    it('404s rather than 409s when the row vanished in a concurrent delete', async () => {
      m.job.deleteMany.mockResolvedValue({ count: 0 });
      m.job.findUnique
        .mockResolvedValueOnce(pendingJob()) // the pre-delete read
        .mockResolvedValueOnce(null); // the disambiguating re-read

      await expect(service.remove(ADMIN, JOB)).rejects.toBeInstanceOf(NotFoundException);
    });

    // Without this the job stays in Elasticsearch and in job-alert emails while
    // its detail page 404s, and Cloudflare keeps serving it for up to an hour.
    it('de-indexes and purges using the PRE-delete snapshot', async () => {
      const row = pendingJob();
      m.job.findUnique.mockResolvedValue(row);

      await service.remove(ADMIN, JOB);

      expect(fakeEffects.fireRemoveSideEffects).toHaveBeenCalledOnce();
      // canonicalSlug is what the cache purge keys on, and it is unreadable
      // after the row is gone — so the snapshot has to be the one read first.
      expect(fakeEffects.fireRemoveSideEffects.mock.calls[0]?.[0]).toMatchObject({
        id: JOB,
        canonicalSlug: 'senior-frontend-engineer-123',
      });
    });

    // Owner decision (this PR): an admin delete is cleanup or enforcement, so
    // refunding would hand a spammer their posting slot straight back. Moderation
    // REJECT refunds; this deliberately does not.
    it('does not refund the recruiter post quota', async () => {
      await service.remove(ADMIN, JOB);
      expect(fakeQuota.refund).not.toHaveBeenCalled();
    });

    // Status is irrelevant to deletability — an unwanted live posting with no
    // responses is as deletable as a draft.
    it('deletes an ACTIVE job just as readily as a draft', async () => {
      m.job.findUnique.mockResolvedValue(pendingJob({ status: 'ACTIVE' }));
      await expect(service.remove(ADMIN, JOB)).resolves.toBeUndefined();
      expect(m.job.deleteMany).toHaveBeenCalledOnce();
    });
  });
});
