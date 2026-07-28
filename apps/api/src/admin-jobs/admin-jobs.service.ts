import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type JobStatus } from '@jobportal/db';
import { JobPublishEffectsService } from '../job-effects/job-publish-effects.service';
import { RecruiterPostQuotaService } from '../recruiter-post-quota/quota.service';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';
import type { ListAdminJobsQueryInput, ModerateJobInput } from './dto';

const PAGE_SIZE = 20;

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(
    private readonly effects: JobPublishEffectsService,
    private readonly quota: RecruiterPostQuotaService,
    private readonly notifications: NotificationsProducerService,
  ) {}

  // The review queue. Defaults to the jobs actually waiting on a decision;
  // ACTIVE/DRAFT are available so the console can show what was recently
  // approved or sent back.
  //
  // Ordering: oldest-first for the pending queue, because a review queue is
  // FIFO and the job that has waited longest is the one to work next. The other
  // views are browsing rather than working, so they read newest-first. Both
  // directions ride the existing @@index([status, postedAt]).
  async listJobs(query: ListAdminJobsQueryInput): Promise<{
    hits: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const status: JobStatus = query.status ?? 'PENDING_MODERATION';
    const where: Prisma.JobWhereInput = { status };
    const direction: Prisma.SortOrder = status === 'PENDING_MODERATION' ? 'asc' : 'desc';

    const [hits, total] = await Promise.all([
      prisma.job.findMany({
        where,
        // `id` breaks ties deterministically so a page boundary can't drop or
        // duplicate a row when several jobs share a postedAt to the millisecond
        // (a bulk seed or a scripted post does exactly that).
        orderBy: [{ postedAt: direction }, { id: direction }],
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
          rejectionReason: true,
          company: { select: { id: true, name: true, slug: true } },
          postedBy: { select: { id: true, name: true, email: true } },
          primaryCity: { select: { name: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return { hits, total, page, pageSize: PAGE_SIZE };
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
      // The slot was consumed at submit time, before anyone knew the job would
      // be refused. Refund it: the recruiter never got a live listing.
      if (updated.postedById != null) {
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
}
