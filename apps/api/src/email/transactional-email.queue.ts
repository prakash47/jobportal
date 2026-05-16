import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import {
  TransactionalEmailProcessor,
  type TransactionalEmailJob,
} from './transactional-email.processor';
import { TransactionalEmailDlqService } from './transactional-email-dlq.queue';

const QUEUE_NAME = 'transactional-emails';

// SRS §4.13.5 — three attempts with exponential backoff. The first retry is
// fast (1s) so a transient Resend hiccup recovers without a noticeable delay
// for the user; subsequent retries (4s, 16s) give the upstream room to come
// back. After the 3rd failure the job is marked `failed`, the worker's
// `failed` listener writes the payload + last error into the DLQ, and Sentry
// gets the stack so on-call sees a real alert (not a silent black hole).
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 1_000;

function buildConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (url) {
    return { host: new URL(url).hostname, port: Number(new URL(url).port || 6379) };
  }
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

@Injectable()
export class TransactionalEmailQueueService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TransactionalEmailQueueService.name);
  private readonly connection = buildConnection();
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly processor: TransactionalEmailProcessor,
    private readonly dlq: TransactionalEmailDlqService,
  ) {}

  onModuleInit(): void {
    if (process.env.TRANSACTIONAL_EMAILS_DISABLED === '1') {
      this.logger.warn(
        'TRANSACTIONAL_EMAILS_DISABLED=1 — queue + worker not started',
      );
      return;
    }
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<TransactionalEmailJob>) => {
        await this.processor.handle(job.data);
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      const attemptsMade = job.attemptsMade;
      // BullMQ marks a job `failed` after each attempt; only forward to the
      // DLQ once we've exhausted the retry budget. Earlier failures will be
      // re-attempted by BullMQ itself with the configured backoff.
      if (attemptsMade < MAX_ATTEMPTS) {
        this.logger.warn(
          `transactional-email job ${job.id} attempt ${attemptsMade}/${MAX_ATTEMPTS} failed: ${err.message}`,
        );
        return;
      }
      this.logger.error(
        `transactional-email job ${job.id} dead-lettered after ${attemptsMade} attempts: ${err.message}`,
      );
      // Phase 1 item 18 — terminal failure goes to Sentry as well as the
      // DLQ so on-call gets a real alert. Closes the PR #24 follow-up
      // chip ("Sentry alerting on terminal DLQ failure"). Gated by
      // killswitch.telemetry so the admin can mute it in an incident.
      const payload = job.data as TransactionalEmailJob;
      isTelemetryEnabled().then((on) => {
        if (!on) return;
        Sentry.captureException(err, {
          tags: { queue: 'transactional-emails', kind: payload.kind },
          extra: {
            jobId: job.id,
            attemptsMade,
            to: payload.to,
            userId: payload.userId,
          },
        });
      }).catch(() => {
        // Telemetry check failed — already defaults to ON inside
        // isTelemetryEnabled, so this branch fires only on bug. Don't
        // double-log.
      });
      this.dlq
        .recordTerminalFailure(payload, err)
        .catch((dlqErr: unknown) => {
          this.logger.error(
            `DLQ insert itself failed for job ${job.id}: ${(dlqErr as Error).message}`,
          );
        });
    });
    this.logger.log(`transactional-email queue + worker online on ${QUEUE_NAME}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  // Producer entry point. Synchronous from the caller's POV — control returns
  // as soon as Redis ack's the enqueue, the actual Resend call happens in the
  // worker. If Redis is offline we log and drop; the alternative (throwing
  // into the request path) would convert a notification miss into a user-
  // visible 5xx, which is worse than a missing email for a non-critical
  // notification. Critical paths (password reset) still surface failure to
  // the user via the response status from the resend endpoint.
  async enqueue(job: TransactionalEmailJob): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `enqueue called but queue is offline (kind=${job.kind}, to=${job.to})`,
      );
      return;
    }
    await this.queue.add(job.kind, job, {
      // Keep BullMQ's default jobId (random) — collapsing two genuine sends to
      // the same recipient (e.g. two password-reset requests in quick
      // succession) by jobId would silently swallow the second, which is
      // worse than two emails arriving.
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  // Test seam.
  getQueue(): Queue | null {
    return this.queue;
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
