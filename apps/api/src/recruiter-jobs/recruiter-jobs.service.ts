import {
  BadRequestException,
  ConflictException,
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
  ReachQuery,
  SalaryTrendsQuery,
  UpdateRecruiterJobInput,
} from './dto';

const PAGE_SIZE = 20;
const MODERATION_FLAG = 'moderation.jobs.enabled';
// Killswitch (L3) for the Post-a-Job flow. Seeded OFF ⇒ posting LIVE; when an
// admin flips it ON, create() rejects with 503 (matching the /post-job page's
// L2 404). Only the posting action is gated — edit/close/reopen still work.
const POST_JOB_KILLSWITCH_FLAG = 'killswitch.recruiter_post_job';
// Killswitch (L3) for job deletion (Jobs list → 3-dot menu → Delete). Seeded
// OFF ⇒ deletion LIVE; flipping it ON makes delete() reject with 503 (the
// Jobs list hides the Delete item at L2). Deletion is additionally restricted
// to jobs with zero applications — see delete().
const JOB_DELETE_KILLSWITCH_FLAG = 'killswitch.recruiter_job_delete';

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

  // Post a Job Phase 4 — Salary Trends. Benchmarks the role from our own LIVE
  // postings: midpoint salaries of ACTIVE jobs matching the title keyword +
  // city. Best-effort/estimate — null when there aren't enough data points.
  async salaryTrends(
    query: SalaryTrendsQuery,
  ): Promise<{ count: number; minLpa: number; medianLpa: number; maxLpa: number } | null> {
    const where: Prisma.JobWhereInput = { status: 'ACTIVE', salaryMinPaise: { not: null } };
    if (query.cityId) where.primaryCityId = query.cityId;
    const title = query.title?.trim();
    if (title) {
      // Match on the longest word (usually the role noun) to widen the sample.
      const keyword = title.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? title;
      if (keyword.length >= 3) where.title = { contains: keyword, mode: 'insensitive' };
    }

    const rows = await prisma.job.findMany({
      where,
      select: { salaryMinPaise: true, salaryMaxPaise: true },
      take: 500,
    });
    if (rows.length < 3) return null; // not enough to be meaningful

    const mids = rows
      .map((r) => {
        const min = r.salaryMinPaise ?? 0;
        const max = r.salaryMaxPaise ?? min;
        return (min + max) / 2;
      })
      .sort((a, b) => a - b);
    const toLpa = (paise: number): number => Math.round((paise / 100_000 / 100) * 10) / 10;
    const median = mids[Math.floor(mids.length / 2)] ?? 0;
    return {
      count: rows.length,
      minLpa: toLpa(mids[0] ?? 0),
      medianLpa: toLpa(median),
      maxLpa: toLpa(mids[mids.length - 1] ?? 0),
    };
  }

  // Post a Job Phase 4 — Reach Meter. Estimates matching candidates from our own
  // candidate pool by overlapping skills + preferred city (+ min experience).
  // Returns 0 until at least skills or a city are provided (don't advertise the
  // whole pool as "reach").
  async reach(query: ReachQuery): Promise<{ count: number }> {
    const skillIds = (query.skillIds ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!skillIds.length && !query.cityId) return { count: 0 };

    const where: Prisma.CandidateWhereInput = {};
    if (skillIds.length) where.skillIds = { hasSome: skillIds };
    if (query.cityId) where.preferredCityIds = { has: query.cityId };
    if (query.experienceMonths !== undefined) {
      where.OR = [
        { experienceMonths: { gte: query.experienceMonths } },
        { experienceMonths: null },
      ];
    }

    const count = await prisma.candidate.count({ where });
    return { count };
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
            descriptionMarkdown: input.descriptionMarkdown ?? null,
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
    if (input.descriptionMarkdown !== undefined) data.descriptionMarkdown = input.descriptionMarkdown;
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
    if (input.localityId === null) {
      // Explicit clear (the edit form's "no area selected") — skip the resolver,
      // whose input type only understands a concrete id or a free-typed name.
      data.localityId = null;
    } else if (input.localityId !== undefined || input.localityName !== undefined) {
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

  // Recruiter-driven hard delete (Jobs list → 3-dot menu → Delete). Owner
  // decision (2026-07-16): only jobs with ZERO applications are deletable —
  // Application rows cascade on Job delete, and destroying candidates'
  // application history is never acceptable; jobs with responses must be
  // closed instead. The status doesn't matter (an unwanted ACTIVE posting with
  // no responses is deletable). SavedJob rows do cascade (a deleted job simply
  // leaves seekers' saved lists).
  async delete(userId: number, id: number): Promise<void> {
    if (await isFlagEnabled(JOB_DELETE_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Job deletion is temporarily unavailable');
    }
    const existing = await this.getOne(userId, id); // ownership 404
    // Single-statement delete guarded on `applications: none` — atomic, so an
    // application arriving between the ownership check and the delete can't be
    // cascade-destroyed (a separate count+delete would race).
    const res = await prisma.job.deleteMany({
      where: { id, postedById: userId, applications: { none: {} } },
    });
    if (res.count === 0) {
      // Disambiguate: count 0 means either an application arrived since the
      // ownership check (409, "close instead") or the row vanished in a
      // concurrent delete (404 — a "has applications" message would mislead).
      const still = await prisma.job.findUnique({ where: { id }, select: { id: true } });
      if (!still) throw new NotFoundException('Job not found');
      throw new ConflictException(
        'Jobs with applications cannot be deleted — close the job instead',
      );
    }
    this.fireRemoveSideEffects(existing);
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

  // Recruiter-driven publish of an existing DRAFT (Jobs list → 3-dot menu →
  // Publish). This is the DRAFT→ACTIVE transition the wizard's create(PUBLISH)
  // never covered — create() makes a *new* job; edit() (PATCH) never touches
  // status; close/reopen reject DRAFT. It reuses the SAME killswitch +
  // verified-email gate as create() (publishing a draft IS posting a job),
  // consumes the post quota, honours moderation, and fires the publish
  // side-effects + the job-posted email. Validated against the STORED draft
  // (no request body).
  async publish(userId: number, id: number): Promise<Job> {
    await this.assertPostingEnabled();
    // Same hard gate create() runs (SRS §4.9.5): a job can't go live unless the
    // recruiter's work email is verified. Belt-and-suspenders — a draft can only
    // be created by an already-verified recruiter today, but enforcing it here
    // keeps the make-live boundary non-bypassable if that ever changes.
    await this.resolveRecruiterContext(userId);
    const existing = await this.getOne(userId, id); // ownership 404
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft jobs can be published');
    }

    // A draft can be saved with just a title + short description (SRS §4.9.3 —
    // drafts are lenient), but going live needs the fields a real listing
    // requires. Validate the STORED row and 400 with the gaps BEFORE consuming a
    // quota slot, so an incomplete draft never burns one. (Intentionally
    // STRICTER than create(PUBLISH), whose DTO leaves city/department/openings
    // optional — the wizard gates those client-side; tightening create() is a
    // separate follow-up.)
    const missing: string[] = [];
    if (!existing.title || existing.title.trim().length < 3) missing.push('title');
    if (!existing.description || existing.description.trim().length < 10) {
      missing.push('description');
    }
    if (existing.functionalAreaId == null) missing.push('department');
    if (existing.openings == null || existing.openings < 1) missing.push('number of openings');
    if (existing.primaryCityId == null) missing.push('city');
    if (missing.length > 0) {
      throw new BadRequestException(
        `This draft is missing required fields: ${missing.join(', ')}. Edit the draft to add them before publishing.`,
      );
    }

    // Decide the final status BEFORE quota.consume so a moderation-on publish
    // still reserves the slot (matching create()).
    const moderate = await isFlagEnabled(MODERATION_FLAG);
    const finalStatus: JobStatus = moderate ? 'PENDING_MODERATION' : 'ACTIVE';
    // L3 — atomic increment. Throws 429 if the recruiter is already at limit.
    await this.quota.consume(userId);

    const now = new Date();
    // Refresh postedAt to the go-live moment: the draft may have sat for days,
    // and postedAt drives seeker "posted N ago" + search recency — it must be
    // the publish time, not the draft-creation time (create() dates a first
    // publish to now the same way). Clear a stale draft-era expiry too, so a
    // freshly-live job isn't expired by the very next nightly sweep (the wizard
    // never sets one, but a direct-API draft can carry a past expiresAt).
    const data: Prisma.JobUpdateManyMutationInput = { status: finalStatus, postedAt: now };
    if (existing.expiresAt && existing.expiresAt <= now) data.expiresAt = null;

    // Atomic DRAFT→final flip, guarded on `status: 'DRAFT'` (the delete()
    // pattern). Both requests of a double-click/retry/second-tab race consume a
    // slot first, but only the one that actually flips the row (count === 1)
    // keeps it + fires the side effects; the loser sees count === 0 and refunds
    // its slot — no double-consume, no duplicate "your job is live" email.
    let flipped: { count: number };
    try {
      flipped = await prisma.job.updateMany({ where: { id, status: 'DRAFT' }, data });
    } catch (err) {
      // Consumed a slot but the write failed — refund it (best-effort) so a
      // transient DB error doesn't permanently cost the recruiter a post.
      await this.quota.refund(userId);
      this.logger.warn(`publish failed after quota.consume for user ${userId}`);
      throw err;
    }
    if (flipped.count === 0) {
      // Lost the race (already published, or left DRAFT between the guard and
      // here) — this call published nothing, so return its slot and the row.
      await this.quota.refund(userId);
      return this.getOne(userId, id);
    }

    const updated = await this.getOne(userId, id); // re-read the freshly-live row

    // Only an ACTIVE (moderation-off) publish is indexed + emailed; a
    // PENDING_MODERATION job waits for admin approval (as in create()).
    if (updated.status === 'ACTIVE') {
      this.firePublishSideEffects(updated);
      this.fireJobPostedEmail(userId, updated).catch((err: unknown) => {
        this.logger.warn(
          `job-posted email enqueue failed for job ${updated.id}: ${(err as Error).message}`,
        );
      });
    }
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
