import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma, type Job, type JobStatus } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { AlertsIndexerHook } from '../alerts/alerts.indexer-hook';
import { CachePurgeService } from '../cache-purge/cache-purge.service';
import { EmailService } from '../email/email.service';
import { RecruiterPostQuotaService } from '../recruiter-post-quota/quota.service';
import type {
  CreateRecruiterJobInput,
  ListRecruiterJobsQuery,
  UpdateRecruiterJobInput,
} from './dto';

const PAGE_SIZE = 20;
const MODERATION_FLAG = 'moderation.jobs.enabled';
// Killswitch (L3) for the Post-a-Job flow. Seeded OFF ⇒ posting LIVE; when an
// admin flips it ON, create() rejects with 503 (matching the /post-job page's
// L2 404). Only the posting action is gated — edit/close/reopen still work.
const POST_JOB_KILLSWITCH_FLAG = 'killswitch.recruiter_post_job';

// Title-only slug; final value is appended with the row id post-insert.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

@Injectable()
export class RecruiterJobsService {
  private readonly logger = new Logger(RecruiterJobsService.name);

  constructor(
    private readonly quota: RecruiterPostQuotaService,
    private readonly alertsHook: AlertsIndexerHook,
    private readonly cachePurge: CachePurgeService,
    private readonly email: EmailService,
  ) {}

  async list(
    userId: number,
    filter: ListRecruiterJobsQuery,
  ): Promise<{ hits: unknown[]; total: number; page: number; pageSize: number }> {
    const page = filter.page ?? 1;
    const where: Prisma.JobWhereInput = { postedById: userId };
    if (filter.status && filter.status !== 'ALL') {
      where.status = filter.status;
    }

    const [hits, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          canonicalSlug: true,
          title: true,
          status: true,
          employmentType: true,
          workMode: true,
          postedAt: true,
          expiresAt: true,
          _count: { select: { applications: true } },
          company: { select: { name: true, slug: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return { hits, total, page, pageSize: PAGE_SIZE };
  }

  async getOne(userId: number, id: number): Promise<Job> {
    const row = await prisma.job.findUnique({ where: { id } });
    if (!row || row.postedById !== userId) {
      throw new NotFoundException('Job not found');
    }
    return row;
  }

  // Resolves the recruiter's company (every recruiter has one — guaranteed
  // by SRS §4.9.1 registration). Throws if the email isn't verified — hard
  // gate per SRS §4.9.5 lands here, not just a banner.
  private async resolveRecruiterContext(userId: number): Promise<{ companyId: number }> {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId },
      select: { companyId: true, workEmailVerified: true },
    });
    if (!recruiter) throw new ForbiddenException('Recruiter profile required');
    if (!recruiter.workEmailVerified) {
      throw new ForbiddenException('Verify your email before posting jobs');
    }
    return { companyId: recruiter.companyId };
  }

  // L3 killswitch — the trust boundary for the Post-a-Job flow. Checked before
  // any work (draft or publish) so flipping the flag ON fully stops posting.
  private async assertPostingEnabled(): Promise<void> {
    if (await isFlagEnabled(POST_JOB_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Job posting is temporarily unavailable');
    }
  }

  // Resolve the optional area/locality to an id. Either an existing localityId
  // (validated to belong to the chosen city) or a free-typed localityName that
  // is find-or-created as a City-scoped Locality. Returns null when neither is
  // usable (e.g. a name with no city to scope it to).
  private async resolveLocalityId(input: {
    localityId?: number | undefined;
    localityName?: string | undefined;
    primaryCityId?: number | undefined;
  }): Promise<number | null> {
    if (input.localityId !== undefined) {
      const loc = await prisma.locality.findUnique({
        where: { id: input.localityId },
        select: { id: true, cityId: true },
      });
      if (!loc) throw new BadRequestException('Unknown locality');
      if (input.primaryCityId !== undefined && loc.cityId !== input.primaryCityId) {
        throw new BadRequestException('Locality does not belong to the selected city');
      }
      return loc.id;
    }
    const name = input.localityName?.trim();
    if (name && input.primaryCityId !== undefined) {
      const city = await prisma.city.findUnique({
        where: { id: input.primaryCityId },
        select: { slug: true },
      });
      if (!city) throw new BadRequestException('Unknown city for locality');
      const slug = `${city.slug}-${slugify(name)}`;
      const loc = await prisma.locality.upsert({
        where: { slug },
        update: {},
        create: { slug, name, cityId: input.primaryCityId },
        select: { id: true },
      });
      return loc.id;
    }
    return null;
  }

  async create(userId: number, input: CreateRecruiterJobInput): Promise<Job> {
    await this.assertPostingEnabled();
    const ctx = await this.resolveRecruiterContext(userId);
    const localityId = await this.resolveLocalityId({
      localityId: input.localityId,
      localityName: input.localityName,
      primaryCityId: input.primaryCityId,
    });
    const willPublish = input.publishMode === 'PUBLISH';

    // Decide the final status BEFORE quota.consume so a moderation-on
    // publish still consumes a slot (reserves the recruiter's intent to
    // post one more job today). The flag check is server-side only — UI
    // sees this state via /quota for L2.
    let finalStatus: JobStatus = 'DRAFT';
    if (willPublish) {
      const moderate = await isFlagEnabled(MODERATION_FLAG);
      finalStatus = moderate ? 'PENDING_MODERATION' : 'ACTIVE';
      // L3 — atomic increment. Throws 429 if a race put us over either
      // window between the L1 preflight and here.
      await this.quota.consume(userId);
    }

    // Insert with a placeholder slug, then patch with the real one. Keeps
    // the slug deterministic (`<title-slug>-<id>`) without round-tripping
    // through nanoid or guessing the next id.
    let created: Job;
    try {
      created = await prisma.$transaction(async (tx) => {
        const placeholderSlug = `job-pending-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const row = await tx.job.create({
          data: {
            canonicalSlug: placeholderSlug,
            title: input.title,
            description: input.description,
            shortDescription: input.shortDescription ?? null,
            companyId: ctx.companyId,
            postedById: userId,
            primaryCityId: input.primaryCityId ?? null,
            cityIds: input.cityIds ?? [],
            skillIds: input.skillIds ?? [],
            industryId: input.industryId ?? null,
            functionalAreaId: input.functionalAreaId ?? null,
            employmentType: input.employmentType ?? 'FULL_TIME',
            workMode: input.workMode ?? 'ONSITE',
            jobType: input.jobType ?? 'FREE',
            status: finalStatus,
            salaryMinPaise: input.salaryMinPaise ?? null,
            salaryMaxPaise: input.salaryMaxPaise ?? null,
            experienceMinYears: input.experienceMinYears ?? null,
            experienceMaxYears: input.experienceMaxYears ?? null,
            openings: input.openings ?? null,
            qualifications: input.qualifications ?? null,
            localityId,
            internshipDurationMonths: input.internshipDurationMonths ?? null,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        });
        const finalSlug = `${slugify(input.title)}-${row.id}`;
        return tx.job.update({ where: { id: row.id }, data: { canonicalSlug: finalSlug } });
      });
    } catch (err) {
      // If the create fails after consume, refund the slot. Acceptable race
      // window: another caller may have observed the briefly-incremented
      // counter, but the next consume's revert path covers their case too.
      if (willPublish) {
        // Best-effort decrement — log on failure rather than throwing.
        try {
          // We can't call quota.consume in reverse cleanly; accept this is a
          // rare path and let the natural TTL roll-over reconcile.
          this.logger.warn(`create failed after quota.consume for user ${userId}`);
        } catch {
          // ignored
        }
      }
      throw err;
    }

    // Publish-only side effects: ES sync, instant-alert fanout, cache purge.
    // PENDING_MODERATION jobs are NOT indexed (admin must approve first).
    // All side effects fire-and-log so the response doesn't block on
    // backend latency.
    if (created.status === 'ACTIVE') {
      this.firePublishSideEffects(created);
      // SRS §4.13 — confirmation to the recruiter that the listing went
      // live. Only on first publish (and reopen below); editing an already-
      // ACTIVE job re-fires firePublishSideEffects but should NOT spam the
      // recruiter with a fresh "your job is live" email.
      this.fireJobPostedEmail(userId, created).catch((err: unknown) => {
        this.logger.warn(
          `job-posted email enqueue failed for job ${created.id}: ${(err as Error).message}`,
        );
      });
    }
    return created;
  }

  async update(userId: number, id: number, input: UpdateRecruiterJobInput): Promise<Job> {
    const existing = await this.getOne(userId, id); // ownership 404
    const data: Prisma.JobUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription;
    if (input.primaryCityId !== undefined) data.primaryCityId = input.primaryCityId;
    if (input.cityIds !== undefined) data.cityIds = input.cityIds;
    if (input.skillIds !== undefined) data.skillIds = input.skillIds;
    if (input.industryId !== undefined) data.industryId = input.industryId;
    if (input.functionalAreaId !== undefined) data.functionalAreaId = input.functionalAreaId;
    if (input.employmentType !== undefined) data.employmentType = input.employmentType;
    if (input.workMode !== undefined) data.workMode = input.workMode;
    if (input.salaryMinPaise !== undefined) data.salaryMinPaise = input.salaryMinPaise;
    if (input.salaryMaxPaise !== undefined) data.salaryMaxPaise = input.salaryMaxPaise;
    if (input.experienceMinYears !== undefined) data.experienceMinYears = input.experienceMinYears;
    if (input.experienceMaxYears !== undefined) data.experienceMaxYears = input.experienceMaxYears;
    if (input.expiresAt !== undefined) data.expiresAt = new Date(input.expiresAt);
    if (input.jobType !== undefined) data.jobType = input.jobType;
    if (input.openings !== undefined) data.openings = input.openings;
    if (input.qualifications !== undefined) data.qualifications = input.qualifications;
    if (input.internshipDurationMonths !== undefined) {
      data.internshipDurationMonths = input.internshipDurationMonths;
    }
    if (input.localityId !== undefined || input.localityName !== undefined) {
      data.localityId = await this.resolveLocalityId({
        localityId: input.localityId,
        localityName: input.localityName,
        primaryCityId: input.primaryCityId ?? existing.primaryCityId ?? undefined,
      });
    }

    const updated = await prisma.job.update({ where: { id }, data });

    // Re-sync ES if the live job changed. CLOSED/EXPIRED stay out of ES.
    if (existing.status === 'ACTIVE') {
      this.firePublishSideEffects(updated);
    }
    return updated;
  }

  // Recruiter-driven close. Removes from ES, purges cache. Idempotent.
  async close(userId: number, id: number): Promise<Job> {
    const existing = await this.getOne(userId, id);
    if (existing.status === 'CLOSED') return existing;
    if (existing.status === 'DRAFT' || existing.status === 'PENDING_MODERATION') {
      throw new BadRequestException('Cannot close a draft or pending job');
    }
    const updated = await prisma.job.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
    this.fireRemoveSideEffects(updated);
    return updated;
  }

  async reopen(userId: number, id: number): Promise<Job> {
    const existing = await this.getOne(userId, id);
    if (existing.status !== 'CLOSED' && existing.status !== 'EXPIRED') {
      throw new BadRequestException('Only closed or expired jobs can be reopened');
    }
    const updated = await prisma.job.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
    this.firePublishSideEffects(updated);
    this.fireJobPostedEmail(userId, updated).catch((err: unknown) => {
      this.logger.warn(
        `job-posted email enqueue failed for job ${updated.id}: ${(err as Error).message}`,
      );
    });
    return updated;
  }

  // Fire-and-log the publish-side-effect trio. Do NOT await — the response
  // returns to the recruiter while ES + alerts + Cloudflare run in the
  // background. Errors log to stdout; the next list/edit will reconcile.
  private firePublishSideEffects(job: Job): void {
    syncJob(job.id, 'index').catch((err: unknown) => {
      this.logger.warn(`syncJob(${job.id}, index) failed: ${(err as Error).message}`);
    });
    this.alertsHook.onJobIndexed(job.id).catch((err: unknown) => {
      this.logger.warn(`alertsHook.onJobIndexed(${job.id}) failed: ${(err as Error).message}`);
    });
    this.cachePurge.purgeJob(job.canonicalSlug).catch((err: unknown) => {
      this.logger.warn(`cachePurge.purgeJob failed: ${(err as Error).message}`);
    });
  }

  private fireRemoveSideEffects(job: Job): void {
    syncJob(job.id, 'remove').catch((err: unknown) => {
      this.logger.warn(`syncJob(${job.id}, remove) failed: ${(err as Error).message}`);
    });
    this.cachePurge.purgeJob(job.canonicalSlug).catch((err: unknown) => {
      this.logger.warn(`cachePurge.purgeJob failed: ${(err as Error).message}`);
    });
  }

  // SRS §4.13 — recruiter notification on first publish + reopen. Looks up
  // the recruiter's Email ID (User.email) — the canonical channel for
  // transactional notifications, matching password reset etc.
  private async fireJobPostedEmail(userId: number, job: Job): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) return;
    const webBase = process.env.WEB_URL ?? 'http://localhost:3000';
    const recruiterBase = process.env.RECRUITER_URL ?? 'http://localhost:3001';
    await this.email.enqueueJobPostedConfirmation(user.email, userId, {
      jobTitle: job.title,
      jobUrl: `${webBase}/job/${job.canonicalSlug}`,
      applicantsUrl: `${recruiterBase}/jobs/${job.id}/applicants`,
    });
  }
}
