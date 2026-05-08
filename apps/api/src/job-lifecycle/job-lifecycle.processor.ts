import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { syncJob } from '@jobportal/search';
import { CachePurgeService } from '../cache-purge/cache-purge.service';

export const JOB_NAMES = {
  EXPIRE_STALE_JOBS: 'expire-stale-jobs',
} as const;

// SRS §4.9.5 — daily sweep that flips ACTIVE jobs whose expiresAt has passed
// to status=EXPIRED and removes them from the public ES index. Idempotent —
// re-running on the same minute produces zero further updates because the
// where-clause filters on status='ACTIVE'.

@Injectable()
export class JobLifecycleProcessor {
  private readonly logger = new Logger(JobLifecycleProcessor.name);

  constructor(private readonly cachePurge: CachePurgeService) {}

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
}
