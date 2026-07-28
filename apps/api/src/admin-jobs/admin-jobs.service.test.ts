import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    job: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    skill: { findMany: vi.fn() },
    city: { findMany: vi.fn() },
    companyKyc: { findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { AdminJobsService } from './admin-jobs.service';

const m = prisma as unknown as {
  job: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  skill: { findMany: ReturnType<typeof vi.fn> };
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
    m.job.updateMany.mockResolvedValue({ count: 1 });
    m.job.findUniqueOrThrow.mockResolvedValue(decidedJob());
    // getJobDetail, called for the return value.
    m.job.findUnique.mockResolvedValue(pendingJob());
    m.skill.findMany.mockResolvedValue([]);
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

    // A review queue is FIFO: the job that has waited longest is the one to work
    // next. Browsing views are the opposite.
    it('orders the pending queue oldest-first and other views newest-first', async () => {
      await service.listJobs({});
      expect(m.job.findMany.mock.calls[0]?.[0].orderBy).toEqual([
        { postedAt: 'asc' },
        { id: 'asc' },
      ]);

      m.job.findMany.mockClear();
      await service.listJobs({ status: 'ACTIVE' });
      expect(m.job.findMany.mock.calls[0]?.[0].orderBy).toEqual([
        { postedAt: 'desc' },
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

    it('REJECT refunds the post slot consumed at submit time', async () => {
      m.job.findUniqueOrThrow.mockResolvedValue(decidedJob({ status: 'DRAFT' }));
      await service.moderate(ADMIN, JOB, { decision: 'REJECT', reason: 'Nope' });
      expect(fakeQuota.refund).toHaveBeenCalledWith(42);
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
});
