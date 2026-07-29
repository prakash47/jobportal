import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import { JOB_NAMES, JobLifecycleProcessor } from './job-lifecycle.processor';

const QUEUE_NAME = 'job-lifecycle';

const DAILY_CRON_DEFAULT = '0 2 * * *'; // 02:00 every day
// Signup OTP purge — hourly, deliberately NOT folded into the 02:00 sweep.
// OtpChallenge.code is stored in plaintext, so a daily cadence would leave a
// code minted at 02:05 sitting readable for the best part of a day after it
// stopped being usable. Hourly bounds that to the TTL plus the grace window.
const OTP_PURGE_CRON_DEFAULT = '0 * * * *'; // top of every hour
const TZ = process.env.JOB_LIFECYCLE_CRON_TZ ?? 'Asia/Kolkata';

function buildConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || 6379) };
  }
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

// SRS §4.9.5 — owns the BullMQ Queue + Worker for the platform's periodic
// sweeps: the daily job-expiry pass and the hourly signup-OTP purge. Separate
// from the alerts queue (job-alerts) to keep concerns clean — neither queue
// needs the other's job types.

@Injectable()
export class JobLifecycleQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobLifecycleQueueService.name);
  private readonly connection = buildConnection();
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly processor: JobLifecycleProcessor) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.JOB_LIFECYCLE_DISABLED === '1') {
      this.logger.warn('JOB_LIFECYCLE_DISABLED=1 — queue + worker not started');
      return;
    }

    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (job.name === JOB_NAMES.EXPIRE_STALE_JOBS) {
          await this.processor.expireStaleJobs();
          return;
        }
        if (job.name === JOB_NAMES.PURGE_EXPIRED_OTPS) {
          await this.processor.purgeExpiredOtps();
          return;
        }
        this.logger.warn(`unknown job-lifecycle job name: ${job.name}`);
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`job-lifecycle ${job?.id} failed: ${err.message}`);
      // Phase 1 item 18 — Sentry capture for daily expiry sweep
      // failures. Cron jobs don't surface failures to a user — without
      // Sentry, a stuck sweep would only show up as ACTIVE-but-expired
      // listings still ranking in search. Gated by killswitch.telemetry.
      isTelemetryEnabled().then((on) => {
        if (!on) return;
        Sentry.captureException(err, {
          tags: { queue: QUEUE_NAME, jobName: job?.name },
          extra: { jobId: job?.id },
        });
      }).catch(() => undefined);
    });

    const cron = process.env.JOB_LIFECYCLE_DAILY_CRON ?? DAILY_CRON_DEFAULT;
    await this.queue.add(
      JOB_NAMES.EXPIRE_STALE_JOBS,
      {},
      { repeat: { pattern: cron, tz: TZ }, jobId: 'expire-stale-jobs-daily' },
    );

    // Second repeatable on the SAME queue and worker — the OTP purge is another
    // small periodic DELETE, so it needs a different cadence, not another
    // Redis connection.
    const otpCron = process.env.JOB_LIFECYCLE_OTP_PURGE_CRON ?? OTP_PURGE_CRON_DEFAULT;
    await this.queue.add(
      JOB_NAMES.PURGE_EXPIRED_OTPS,
      {},
      { repeat: { pattern: otpCron, tz: TZ }, jobId: 'purge-expired-otps-hourly' },
    );

    this.logger.log(
      `job-lifecycle online — daily=${cron}, otpPurge=${otpCron}, tz=${TZ}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
