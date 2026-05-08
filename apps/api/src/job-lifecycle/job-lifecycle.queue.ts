import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { JOB_NAMES, JobLifecycleProcessor } from './job-lifecycle.processor';

const QUEUE_NAME = 'job-lifecycle';

const DAILY_CRON_DEFAULT = '0 2 * * *'; // 02:00 every day
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

// SRS §4.9.5 — owns the BullMQ Queue + Worker for the daily expiry sweep.
// Separate from the alerts queue (job-alerts) to keep concerns clean —
// neither queue needs the other's job types.

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
        this.logger.warn(`unknown job-lifecycle job name: ${job.name}`);
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`job-lifecycle ${job?.id} failed: ${err.message}`);
    });

    const cron = process.env.JOB_LIFECYCLE_DAILY_CRON ?? DAILY_CRON_DEFAULT;
    await this.queue.add(
      JOB_NAMES.EXPIRE_STALE_JOBS,
      {},
      { repeat: { pattern: cron, tz: TZ }, jobId: 'expire-stale-jobs-daily' },
    );

    this.logger.log(`job-lifecycle online — daily=${cron}, tz=${TZ}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
