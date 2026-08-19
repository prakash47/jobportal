import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import { BroadcastsProcessor, type BroadcastJob } from './broadcasts.processor';

const QUEUE_NAME = 'broadcasts';

/**
 * Retry budget per RECIPIENT.
 *
 * Slower and longer than the transactional queue's 1s base, on purpose: the
 * dominant terminal failure for bulk mail is a provider 429, and retrying that
 * aggressively is how a sending domain gets throttled harder. 2s / 8s / 32s
 * gives the upstream room without holding the queue open for minutes.
 *
 * ⚠ `attempts` MUST be set explicitly. BullMQ's default is 1, and the two other
 * queues in this repo (`job-alerts`, `job-lifecycle`) both omit it while their
 * own comments claim "BullMQ's retry will re-scan and re-email" — neither
 * actually retries. Do not assume a new queue inherits a retry policy.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 2_000;

/**
 * Outbound pace, in jobs per second.
 *
 * Resend's default allowance is around 2 requests/second. This is the reason the
 * delivery job is one-per-recipient: BullMQ's limiter throttles JOBS, so a batch
 * job looping over 200 addresses would be completely unthrottled from the
 * queue's point of view and would burst straight into 429s.
 *
 * Concurrency is 1 alongside it. A higher concurrency under a 2/s limiter buys
 * nothing except more in-flight work to lose when the process is killed — and
 * this process is killed uncleanly on every deploy, because
 * `app.enableShutdownHooks()` is never called anywhere in this repo.
 */
const RATE_LIMIT_PER_SECOND = 2;
const WORKER_CONCURRENCY = 1;

/**
 * Redis connection.
 *
 * ⚠ This does NOT copy the `buildConnection()` helper that appears in
 * `transactional-email.queue.ts`, `transactional-email-dlq.queue.ts` and
 * `alerts.queue.ts`. That helper reads ONLY `hostname` and `port` from
 * REDIS_URL, so it silently discards any username, password, database index or
 * `rediss://` TLS scheme. Against a managed Redis those three queues would fail
 * to connect while `RedisService` and `@jobportal/feature-flags` — which pass
 * the whole URL to ioredis — worked fine, making it look like a queue bug rather
 * than a config one.
 *
 * Deliberately not fixed in the other three here: they are unrelated shared
 * surfaces and changing every queue's connection handling inside a broadcast PR
 * is how an unreviewable diff happens. Recorded as a follow-up instead.
 */
function buildConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    return {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    };
  }
  const parsed = new URL(url);
  const dbPath = parsed.pathname.replace(/^\//, '');
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(dbPath === '' ? {} : { db: Number(dbPath) }),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

@Injectable()
export class BroadcastsQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BroadcastsQueueService.name);
  private readonly connection = buildConnection();
  private queue: Queue<BroadcastJob> | null = null;
  private worker: Worker<BroadcastJob> | null = null;

  constructor(private readonly processor: BroadcastsProcessor) {}

  onModuleInit(): void {
    // Same env escape hatch the transactional queue uses, so a deployment can
    // run an API instance that serves HTTP without also running this worker.
    if (process.env.BROADCASTS_DISABLED === '1') {
      this.logger.warn('BROADCASTS_DISABLED=1 — broadcast queue + worker not started');
      return;
    }

    this.queue = new Queue<BroadcastJob>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
        removeOnComplete: 200,
        removeOnFail: 1_000,
      },
    });

    this.processor.setEnqueue((jobs) => this.enqueueMany(jobs));

    this.worker = new Worker<BroadcastJob>(
      QUEUE_NAME,
      async (job: Job<BroadcastJob>) => {
        await this.processor.handle(job.data);
      },
      {
        connection: this.connection,
        concurrency: WORKER_CONCURRENCY,
        limiter: { max: RATE_LIMIT_PER_SECOND, duration: 1_000 },
      },
    );

    this.worker.on('failed', (job, err) => {
      if (!job) return;
      if (job.attemptsMade < MAX_ATTEMPTS) {
        this.logger.warn(
          `broadcast job ${job.id} attempt ${job.attemptsMade}/${MAX_ATTEMPTS} failed: ${err.message}`,
        );
        return;
      }
      const payload = job.data;
      this.logger.error(
        `broadcast job ${job.id} failed terminally after ${job.attemptsMade} attempts: ${err.message}`,
      );

      // Terminal failure is recorded on the RECIPIENT ROW rather than in a
      // dead-letter queue. The DLQ shape the transactional queue uses exists so
      // a lost email can be re-driven later; here the ledger already holds the
      // address and the reason, and it is the surface the console reads — a
      // second, invisible copy in Redis would be the thing nobody checks. (The
      // transactional DLQ's own re-drive script does not exist either.)
      if (payload.kind === 'deliver') {
        this.processor
          .recordTerminalFailure(payload.broadcastId, payload.recipientId, err.message)
          .catch((markErr: unknown) => {
            this.logger.error(
              `could not mark recipient ${payload.recipientId} failed: ${(markErr as Error).message}`,
            );
          });
      }

      isTelemetryEnabled()
        .then((on) => {
          if (!on) return;
          Sentry.captureException(err, {
            tags: { queue: QUEUE_NAME, kind: payload.kind },
            extra: { jobId: job.id, attemptsMade: job.attemptsMade, ...payload },
          });
        })
        .catch(() => {
          // isTelemetryEnabled defaults to ON internally, so this branch is a
          // bug path only. Don't double-log.
        });
    });

    this.logger.log(
      `broadcast queue + worker online on ${QUEUE_NAME} (concurrency ${WORKER_CONCURRENCY}, ${RATE_LIMIT_PER_SECOND}/s)`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Kick off a dispatch.
   *
   * ⚠ Unlike `TransactionalEmailQueueService.enqueue`, this THROWS when the
   * queue is unavailable instead of logging and dropping. That inversion is
   * deliberate. There, a swallowed enqueue costs one notification and the
   * alternative was 500ing a request whose real work had already committed.
   * Here the broadcast row has already been moved to SENDING and audited, so a
   * silent drop leaves a broadcast that claims to be sending forever and reaches
   * nobody — with the admin told it worked. The caller rolls the status back.
   */
  async enqueuePlan(broadcastId: number): Promise<void> {
    if (!this.queue) throw new Error('Broadcast queue is offline');
    await this.queue.add(
      'plan',
      { kind: 'plan', broadcastId },
      // Deterministic, so a retried dispatch cannot start two planning passes
      // over the same broadcast. The transactional queue deliberately does the
      // opposite (random ids, because collapsing two genuine password resets
      // would swallow the second) — here collapsing is exactly what is wanted.
      { jobId: `broadcast:${broadcastId}:plan` },
    );
  }

  private async enqueueMany(jobs: BroadcastJob[]): Promise<void> {
    if (!this.queue) throw new Error('Broadcast queue is offline');
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: job.kind,
        data: job,
        opts:
          job.kind === 'deliver'
            ? // One job per (broadcast, recipient). Layered on top of the DB's
              // @@unique([broadcastId, userId]) rather than instead of it: this
              // stops a duplicate job existing, the row status stops a duplicate
              // SEND even if one did.
              { jobId: `broadcast:${job.broadcastId}:recipient:${job.recipientId}` }
            : {},
      })),
    );
  }

  /** Test seam. */
  getQueue(): Queue<BroadcastJob> | null {
    return this.queue;
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
