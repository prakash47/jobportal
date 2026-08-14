import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma, Prisma, type JobStatus } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { JobPublishEffectsService } from '../job-effects/job-publish-effects.service';
import { RecruiterPostQuotaService } from '../recruiter-post-quota/quota.service';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';
import type { ListAdminJobsQueryInput, ModerateJobInput } from './dto';

const PAGE_SIZE = 20;

// Emergency stop for the admin delete. Declared as a literal here rather than
// imported from FLAG, matching recruiter-jobs.service.ts's three killswitch
// constants — the flag package's key map is not imported anywhere in apps/api.
const ADMIN_JOB_DELETE_KILLSWITCH_FLAG = 'killswitch.admin_job_delete';

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(
    private readonly effects: JobPublishEffectsService,
    private readonly quota: RecruiterPostQuotaService,
    private readonly notifications: NotificationsProducerService,
  ) {}

  // The review console's two views — see JOB_REVIEW_VIEWS for why this is not a
  // raw status filter.
  //
  // Ordering. `pending` is FIFO — the job that has waited longest is the one to
  // work next — and it sorts on submittedForReviewAt, NOT postedAt. reopen()
  // returns a previously-live job to review without touching postedAt, so a job
  // reopened today can carry a postedAt from months ago and would jump the whole
  // queue if it were ordered on that. Backed by
  // @@index([status, submittedForReviewAt]).
  //
  // `decided` is newest-decision-first, which is what "what just happened"
  // wants. It has no covering index and does not need one: it is bounded by the
  // number of jobs a human has ever ruled on, and is not on any hot path.
  async listJobs(query: ListAdminJobsQueryInput): Promise<{
    hits: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pending = (query.view ?? 'pending') === 'pending';
    const where: Prisma.JobWhereInput = pending
      ? { status: 'PENDING_MODERATION' }
      : { reviewedAt: { not: null } };

    const [hits, total] = await Promise.all([
      prisma.job.findMany({
        where,
        // `id` breaks ties deterministically so a page boundary can't drop or
        // duplicate a row when several jobs share a timestamp to the millisecond
        // (a bulk seed or a scripted post does exactly that).
        orderBy: pending
          ? [{ submittedForReviewAt: 'asc' }, { id: 'asc' }]
          : [{ reviewedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          canonicalSlug: true,
          title: true,
          status: true,
          postedAt: true,
          submittedForReviewAt: true,
          reviewedAt: true,
          reviewedById: true,
          rejectionReason: true,
          company: { select: { id: true, name: true, slug: true } },
          postedBy: { select: { id: true, name: true, email: true } },
          primaryCity: { select: { name: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Who decided. reviewedById is a loose id with no FK (matching
    // CompanyKyc.reviewedById), so it cannot be `include`d and is hydrated
    // separately — null-tolerantly, because the admin account may since have
    // been deleted. Same shape listAuditLog uses for changedById.
    const reviewerIds = [...new Set(hits.map((h) => h.reviewedById).filter((id) => id != null))];
    const reviewers = reviewerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(reviewers.map((r) => [r.id, r]));

    return {
      hits: hits.map((h) => ({
        ...h,
        reviewedBy: h.reviewedById == null ? null : (byId.get(h.reviewedById) ?? null),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  // Everything a reviewer needs to judge a posting on one screen. The array
  // columns (skillIds / cityIds) are resolved to names here rather than in the
  // UI: a reviewer cannot assess "skillIds: [3, 17]".
  async getJobDetail(id: number): Promise<unknown> {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: {
          select: { id: true, name: true, slug: true, websiteUrl: true, logoUrl: true },
        },
        postedBy: { select: { id: true, name: true, email: true } },
        primaryCity: { select: { name: true } },
        locality: { select: { name: true } },
        industry: { select: { name: true } },
        functionalArea: { select: { name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    const [skills, cities, kyc] = await Promise.all([
      job.skillIds.length
        ? prisma.skill.findMany({ where: { id: { in: job.skillIds } }, select: { name: true } })
        : Promise.resolve([]),
      job.cityIds.length
        ? prisma.city.findMany({ where: { id: { in: job.cityIds } }, select: { name: true } })
        : Promise.resolve([]),
      // Whether the posting company is verified is the single most useful
      // signal a moderator has, so it travels with the job rather than
      // costing a second page visit.
      prisma.companyKyc.findUnique({
        where: { companyId: job.companyId },
        select: { status: true },
      }),
    ]);

    return {
      ...job,
      skills: skills.map((s) => s.name),
      cities: cities.map((c) => c.name),
      companyKycStatus: kyc?.status ?? 'NOT_SUBMITTED',
    };
  }

  // Approve a job waiting in review, or send it back to the recruiter with a
  // reason. Deliberately NOT gated by moderation.jobs.enabled: turning intake
  // off must not strand a queue that already has jobs in it, which is the same
  // reasoning the KYC and support admin controllers document.
  async moderate(adminUserId: number, jobId: number, input: ModerateJobInput): Promise<unknown> {
    const existing = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        title: true,
        canonicalSlug: true,
        postedById: true,
        expiresAt: true,
        postQuotaConsumed: true,
      },
    });
    if (!existing) throw new NotFoundException('Job not found');
    if (existing.status !== 'PENDING_MODERATION') {
      throw new BadRequestException('Only jobs awaiting review can be approved or sent back');
    }

    const approve = input.decision === 'APPROVE';
    // REJECT returns the job to DRAFT rather than a terminal REJECTED state, so
    // the recruiter fixes it and resubmits through the existing publish() path.
    const newStatus: JobStatus = approve ? 'ACTIVE' : 'DRAFT';
    const reason = approve ? null : (input.reason ?? null);
    const now = new Date();

    const data: Prisma.JobUpdateManyMutationInput = {
      status: newStatus,
      reviewedAt: now,
      reviewedById: adminUserId,
      rejectionReason: reason,
      // The job is leaving review either way, so any slot it was holding is
      // settled here — spent on approval, handed back on rejection.
      postQuotaConsumed: false,
    };
    if (approve) {
      // postedAt means "reached the market". The recruiter submitted it whenever
      // they submitted it, but a seeker can only see it from now, so "posted N
      // ago" and the search recency signal both date from approval.
      // submittedForReviewAt keeps the original instant, so the wait is still
      // recoverable as reviewedAt − submittedForReviewAt.
      data.postedAt = now;
      // A job can sit in review past its own expiry — the nightly sweep only
      // looks at ACTIVE rows, so nothing catches it while pending. Without this
      // the job would go live and be expired again by the next sweep, with the
      // recruiter's quota already spent.
      if (existing.expiresAt && existing.expiresAt <= now) data.expiresAt = null;
    }

    // The status guard and the audit row commit together. Two admins clicking
    // Approve on the same job both pass the read above; only the one whose
    // updateMany matches a still-PENDING row writes anything, so the job is
    // indexed once, audited once and the recruiter notified once. (The KYC
    // review path does a bare read-then-update and has this race — not copied.)
    const decided = await prisma.$transaction(async (tx) => {
      const flipped = await tx.job.updateMany({
        where: { id: jobId, status: 'PENDING_MODERATION' },
        data,
      });
      if (flipped.count === 0) return false;
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: approve ? 'JOB_APPROVED' : 'JOB_REJECTED',
          // Ids, the transition, and the admin's own words only — never the
          // job's title or description. Same minimisation rule the KYC and
          // support audit rows follow (the reason is admin-authored, so unlike
          // user content it is safe to record).
          diff: {
            jobId,
            status: { before: 'PENDING_MODERATION', after: newStatus },
            ...(reason ? { reason } : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    });

    if (!decided) {
      throw new ConflictException('This job has already been reviewed');
    }

    this.logger.log(`admin=${adminUserId} ${input.decision} job=${jobId}`);

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

    if (approve) {
      // The row is ACTIVE before this runs — indexJob does no status filtering
      // of its own, so ordering is what keeps an unapproved job out of search.
      this.effects.firePublishSideEffects(updated);
      if (updated.postedById != null) {
        this.effects.fireJobPostedEmail(updated.postedById, updated).catch((err: unknown) => {
          this.logger.warn(
            `job-posted email enqueue failed for job ${jobId}: ${(err as Error).message}`,
          );
        });
      }
    } else {
      // A pending job's detail page is publicly cacheable (next.config stamps
      // /job/:slug with s-maxage=60 + SWR 1h), so a rejection has to purge or
      // the refused content keeps being served from the edge for up to an hour.
      // syncJob(remove) is a no-op for a job that was never indexed, which is
      // the normal case here — it is cheap insurance for a job that reached
      // review by some other path.
      this.effects.fireRemoveSideEffects(updated);
      // Give the slot back — the recruiter never got a live listing — but ONLY
      // if one was actually spent to get here. Not every route into review
      // consumes: create(PUBLISH) and publish() do, while reopen() deliberately
      // does not, because relisting an existing job is not posting a new one.
      // Refunding unconditionally would hand back a slot that was never taken,
      // and reopen → reject would mint a free post, farmable once per closed job
      // the recruiter owns.
      if (updated.postedById != null && existing.postQuotaConsumed) {
        await this.quota.refund(updated.postedById).catch((err: unknown) => {
          this.logger.warn(`quota refund failed for job ${jobId}: ${(err as Error).message}`);
        });
      }
    }

    // Fire-and-log after the decision commits, so a notification failure can
    // never roll back or 5xx the admin's review action.
    this.notifications
      .notifyJobModerationDecision({
        recruiterUserId: updated.postedById,
        jobId,
        jobTitle: updated.title,
        decision: approve ? 'APPROVED' : 'REJECTED',
        rejectionReason: reason,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `job-moderation notification failed for job=${jobId}: ${(err as Error).message}`,
        );
      });

    return this.getJobDetail(jobId);
  }

  /**
   * Admin hard-delete of a job posting (/sadmin/job-postings → Delete).
   *
   * ZERO-APPLICATION JOBS ONLY. This inherits the owner's 2026-07-16 ruling on
   * the recruiter delete verbatim (recruiter-jobs.service.ts `delete`), and the
   * reason is the cascade rather than politeness: `Application` is
   * `onDelete: Cascade` on Job, so deleting a job with responses destroys
   * candidates' own application history — rows they can still see in their
   * /applications tracker — with no undo and no notice to them. A job with
   * responses must be CLOSED instead, which the recruiter portal already does.
   *
   * The admin is deliberately NOT given an override. Being able to reach every
   * company's postings is exactly why this boundary is tighter here, not looser.
   *
   * Status is irrelevant: an unwanted ACTIVE posting with no responses is as
   * deletable as a DRAFT. `SavedJob` and `JobCollaborator` do cascade and are
   * accepted collateral — a deleted job simply leaves seekers' saved lists.
   *
   * Quota is deliberately NOT refunded (owner decision, this PR). Moderation
   * REJECT refunds because the recruiter never got a live listing; an admin
   * delete is a cleanup or enforcement action, and refunding would hand a
   * spammer their slot straight back.
   */
  async remove(adminUserId: number, jobId: number): Promise<void> {
    if (await isFlagEnabled(ADMIN_JOB_DELETE_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Job deletion is temporarily unavailable');
    }

    // Read BEFORE the delete: fireRemoveSideEffects takes the row itself (it
    // reads .id and .canonicalSlug), and after the delete there is nothing left
    // to read it from. Selecting the whole row rather than a projection because
    // that helper's parameter is a full `Job`.
    const existing = await prisma.job.findUnique({ where: { id: jobId } });
    if (!existing) throw new NotFoundException('Job not found');

    // The invariant lives INSIDE the where-clause, not in a count-then-delete:
    // this is a single atomic statement, so an application arriving between a
    // separate check and the delete cannot be cascade-destroyed. Same
    // construction, and the same reasoning, as the recruiter path.
    //
    // The audit row commits in the SAME transaction as the delete, so a job can
    // never be destroyed without a trace of who did it.
    const deleted = await prisma.$transaction(async (tx) => {
      const res = await tx.job.deleteMany({
        where: { id: jobId, applications: { none: {} } },
      });
      if (res.count === 0) return false;
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'JOB_DELETED',
          // Ids and the status it was in only — never the job's title or
          // description. Same minimisation rule moderate() above follows.
          // applicationCount is recorded as the measured 0 that the where-clause
          // above proved, so the row states the invariant that was held rather
          // than leaving a reader to assume it.
          diff: {
            jobId,
            status: existing.status,
            companyId: existing.companyId,
            applicationCount: 0,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    });

    if (!deleted) {
      // count 0 means either the row vanished in a concurrent delete (404 — a
      // "has applications" message would mislead) or an application arrived
      // since the read above (409, "close instead"). Disambiguated by re-reading
      // rather than guessed.
      const still = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
      if (!still) throw new NotFoundException('Job not found');
      throw new ConflictException(
        'Jobs with applications cannot be deleted — close the job instead',
      );
    }

    // Logged at WARN, unlike moderate()'s `log`. This is the one irreversible
    // action in this console and its side effects below are fire-and-forget with
    // no reconciliation path for a row that no longer exists — so if the ES
    // de-index fails, this line is the only record an operator has to hand-remove
    // the orphaned document from.
    this.logger.warn(`admin=${adminUserId} DELETED job=${jobId} slug=${existing.canonicalSlug}`);

    // Required, not optional: without it the job stays in the Elasticsearch index
    // and in job-alert emails while its detail page 404s — a searchable ghost —
    // and Cloudflare keeps serving the deleted page for up to an hour
    // (next.config stamps /job/:slug with s-maxage=60, SWR 1h). Fired with the
    // pre-delete snapshot so canonicalSlug is present for the purge.
    this.effects.fireRemoveSideEffects(existing);
  }
}
