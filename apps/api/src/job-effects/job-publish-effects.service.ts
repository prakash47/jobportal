import { Injectable, Logger } from '@nestjs/common';
import { prisma, type Job } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { AlertsIndexerHook } from '../alerts/alerts.indexer-hook';
import { CachePurgeService } from '../cache-purge/cache-purge.service';
import { EmailService } from '../email/email.service';

// The side effects of a job REACHING or LEAVING the public market, extracted so
// the two make-live paths can't drift.
//
// Before job moderation there was exactly one make-live path (RecruiterJobsService
// create/publish/reopen) and these lived there as private methods. Admin approval
// is now a second one: it takes a PENDING_MODERATION job to ACTIVE, which is the
// moment a seeker can first see it, so it owes the market the identical sequence.
// Calling `prisma.job.update({ status: 'ACTIVE' })` on its own would produce a job
// that is live in the database but absent from search, absent from the instant
// job-alert fanout, and stale in Cloudflare's edge cache.
//
// This mirrors the precedent set by `missingPublishFields()`, which was extracted
// from publish() into dto.ts for the same reason once create(PUBLISH) became a
// second path to the same decision.
@Injectable()
export class JobPublishEffectsService {
  private readonly logger = new Logger(JobPublishEffectsService.name);

  constructor(
    private readonly alertsHook: AlertsIndexerHook,
    private readonly cachePurge: CachePurgeService,
    private readonly email: EmailService,
  ) {}

  // Fire-and-log the publish-side-effect trio. Do NOT await — the response
  // returns to the caller while ES + alerts + Cloudflare run in the background.
  // Errors log to stdout; the next list/edit will reconcile.
  //
  // ORDER MATTERS: the job row must already be ACTIVE before this is called.
  // `indexJob` does NO status filtering of its own — it indexes whatever it is
  // handed — so calling this while the row is still PENDING_MODERATION would
  // publish an unapproved job straight into the live search index.
  firePublishSideEffects(job: Job): void {
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

  // The inverse: the job must stop being publicly reachable. Used by close(),
  // and by a moderation REJECT — a rejected job's detail page may already be
  // sitting in the shared edge cache (next.config stamps /job/:slug with
  // s-maxage=60, stale-while-revalidate=3600), so without the purge the content
  // an admin just refused keeps being served for up to an hour.
  fireRemoveSideEffects(job: Job): void {
    syncJob(job.id, 'remove').catch((err: unknown) => {
      this.logger.warn(`syncJob(${job.id}, remove) failed: ${(err as Error).message}`);
    });
    this.cachePurge.purgeJob(job.canonicalSlug).catch((err: unknown) => {
      this.logger.warn(`cachePurge.purgeJob failed: ${(err as Error).message}`);
    });
  }

  // SRS §4.13 — "your job is live" confirmation. `recipientUserId` is the person
  // who owns the listing, NOT whoever triggered the transition: on admin approval
  // the actor is an admin and the recipient is the job's poster. Callers pass
  // Job.postedById there, which is nullable (SetNull when a recruiter departs),
  // so a job whose poster has left simply gets no email.
  async fireJobPostedEmail(recipientUserId: number, job: Job): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true },
    });
    if (!user) return;
    const webBase = process.env.WEB_URL ?? 'http://localhost:3000';
    const recruiterBase = process.env.RECRUITER_URL ?? 'http://localhost:3001';
    await this.email.enqueueJobPostedConfirmation(user.email, recipientUserId, {
      jobTitle: job.title,
      jobUrl: `${webBase}/job/${job.canonicalSlug}`,
      applicantsUrl: `${recruiterBase}/jobs/${job.id}/applicants`,
    });
  }
}
