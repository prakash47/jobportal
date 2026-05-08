import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { TransactionalEmailJob } from './transactional-email.processor';

const QUEUE_NAME = 'transactional-emails-dlq';

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

// SRS §4.13.5 — terminal-failure dead-letter sink. After the main queue
// exhausts its 3 retries we drop the original job + last error here so an
// operator can re-drive it by hand once the upstream is healthy. No worker
// is attached to this queue — items only leave it when ops intervenes,
// otherwise they sit forever (well, until the 7-day BullMQ default).
//
// Why not a separate Postgres table? BullMQ already has the persistence; an
// extra table just creates two sources of truth for "did this email
// actually go out". Re-driving a job from the DLQ is `queue.add(...)` on
// the main queue with the same payload — see scripts/redrive-dlq.ts when
// we add it.
@Injectable()
export class TransactionalEmailDlqService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TransactionalEmailDlqService.name);
  private readonly connection = buildConnection();
  private queue: Queue | null = null;

  onModuleInit(): void {
    if (process.env.TRANSACTIONAL_EMAILS_DISABLED === '1') return;
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.logger.log(`transactional-email DLQ online on ${QUEUE_NAME}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  async recordTerminalFailure(
    payload: TransactionalEmailJob,
    err: Error,
  ): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `DLQ offline; dropping terminal failure for kind=${payload.kind}, to=${payload.to}`,
      );
      return;
    }
    await this.queue.add(
      payload.kind,
      {
        payload,
        failedAt: new Date().toISOString(),
        errorMessage: err.message,
        errorStack: err.stack ?? null,
      },
      { removeOnComplete: false, removeOnFail: false },
    );
  }

  getQueue(): Queue | null {
    return this.queue;
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
