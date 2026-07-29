import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { CachePurgeService } from '../cache-purge/cache-purge.service';

export const JOB_NAMES = {
  EXPIRE_STALE_JOBS: 'expire-stale-jobs',
  PURGE_EXPIRED_OTPS: 'purge-expired-otps',
} as const;

// How long a dead OtpChallenge row survives past its own expiresAt before the
// sweep destroys it. Non-zero on purpose: for this window verify() can still
// answer "That code has expired. Request a new one.", whereas a row deleted the
// instant it expired would produce the misleading "Request a code first." An
// hour is short enough that a plaintext code is never around for long and long
// enough to cover a registrant who walked away mid-signup.
const OTP_PURGE_GRACE_MS = 60 * 60 * 1000;

// The bodies behind the job-lifecycle queue's repeatables — one method per
// registered job name. Every method here must be idempotent: BullMQ can replay
// a repeatable after a failure, and both sweeps are re-run safely because their
// where-clauses stop matching once the work is done.

@Injectable()
export class JobLifecycleProcessor {
  private readonly logger = new Logger(JobLifecycleProcessor.name);

  constructor(private readonly cachePurge: CachePurgeService) {}

  // SRS §4.9.5 — daily sweep that flips ACTIVE jobs whose expiresAt has passed
  // to status=EXPIRED and removes them from the public ES index. Idempotent —
  // re-running on the same minute produces zero further updates because the
  // where-clause filters on status='ACTIVE'.
  async expireStaleJobs(): Promise<{ expired: number }> {
    if (process.env.JOB_EXPIRY_DISABLED === '1') {
      this.logger.warn('JOB_EXPIRY_DISABLED=1 — skipping expiry sweep');
      return { expired: 0 };
    }

    const now = new Date();
    const stale = await prisma.job.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { not: null, lt: now },
      },
      select: { id: true, canonicalSlug: true },
    });

    if (stale.length === 0) {
      this.logger.log('expiry sweep: 0 stale jobs');
      return { expired: 0 };
    }

    await prisma.job.updateMany({
      where: { id: { in: stale.map((j) => j.id) } },
      data: { status: 'EXPIRED' },
    });

    // Remove from ES + purge Cloudflare per id. Both fire-and-log so one
    // failure doesn't block the rest of the batch.
    for (const job of stale) {
      syncJob(job.id, 'remove').catch((err: unknown) => {
        this.logger.warn(
          `expiry: syncJob(${job.id}, remove) failed — ${(err as Error).message}`,
        );
      });
      this.cachePurge.purgeJob(job.canonicalSlug).catch((err: unknown) => {
        this.logger.warn(
          `expiry: purgeJob(${job.canonicalSlug}) failed — ${(err as Error).message}`,
        );
      });
    }

    this.logger.log(`expiry sweep: ${stale.length} jobs marked EXPIRED + removed from ES`);
    return { expired: stale.length };
  }

  // SRS §4.9.1 — destroy signup one-time codes once they can no longer be used.
  // OtpChallenge.code is stored in PLAINTEXT (there is no provider to send it,
  // so a staff member reads it off /sadmin/otp-sessions and relays it), which
  // makes "how long does a dead code sit in the database" a real exposure
  // window rather than housekeeping. Hence its own hourly repeatable rather
  // than a second body in the 02:00 sweep.
  //
  // Idempotent: a re-run on the same minute deletes nothing further, because
  // the rows it would have matched are already gone. A single deleteMany rather
  // than a find-then-delete — nothing downstream needs to know which rows went,
  // and reading them would pull plaintext codes into memory for no reason.
  async purgeExpiredOtps(): Promise<{ purged: number }> {
    const cutoff = new Date(Date.now() - OTP_PURGE_GRACE_MS);
    const { count } = await prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    // A count only — never a code, a destination or a signupId.
    this.logger.log(`otp purge: ${count} expired challenge(s) deleted`);
    return { purged: count };
  }
}
