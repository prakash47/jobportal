import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { AlertsProcessor, JOB_NAMES, type ScanAlertJobData } from './alerts.processor';

const QUEUE_NAME = 'job-alerts';

function buildConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (url) {
    // ioredis URL form: redis://[user:pass@]host:port[/db]
    return { host: new URL(url).hostname, port: Number(new URL(url).port || 6379) };
  }
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

// Wraps the BullMQ Queue for producers + owns the Worker lifecycle. In-process
// per CLAUDE.md §1 — no separate worker app yet. Consumers call enqueueScan()
// to schedule a one-off scanAlert job; the schedulers (alerts.scheduler.ts)
// register repeatables for daily / weekly cron.
@Injectable()
export class AlertsQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AlertsQueueService.name);
  private readonly connection = buildConnection();
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly processor: AlertsProcessor) {}

  onModuleInit(): void {
    if (process.env.JOB_ALERTS_DISABLED === '1') {
      this.logger.warn('JOB_ALERTS_DISABLED=1 — queue + worker not started');
      return;
    }
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (job.name === JOB_NAMES.SCAN_ALERT) {
          const data = job.data as ScanAlertJobData;
          await this.processor.scanAlert(data.alertId);
          return;
        }
        if (job.name === JOB_NAMES.SCAN_FREQUENCY) {
          await this.processor.scanFrequency(job.data as { frequency: string });
          return;
        }
        this.logger.warn(`unknown alerts job name: ${job.name}`);
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`alerts job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log(`alerts queue + worker online on ${QUEUE_NAME}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueScan(alertId: number): Promise<void> {
    if (!this.queue) {
      this.logger.warn(`enqueueScan called but queue is offline (alertId=${alertId})`);
      return;
    }
    await this.queue.add(
      JOB_NAMES.SCAN_ALERT,
      { alertId } satisfies ScanAlertJobData,
      { jobId: `scan-alert-${alertId}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 },
    );
  }

  async enqueueFrequencySweep(frequency: 'daily' | 'weekly'): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      JOB_NAMES.SCAN_FREQUENCY,
      { frequency },
      { jobId: `scan-frequency-${frequency}-${Date.now()}`, removeOnComplete: 50, removeOnFail: 50 },
    );
  }

  // Test seam — exposes the queue for the scheduler so it can register
  // repeatables on the same instance.
  getQueue(): Queue | null {
    return this.queue;
  }

  static get queueName(): string {
    return QUEUE_NAME;
  }
}
