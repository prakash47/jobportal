import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { JOB_NAMES } from './alerts.processor';
import { AlertsQueueService } from './alerts.queue';

// SRS §4.5.2 — registers BullMQ repeatables for the daily + weekly sweeps.
// Repeatables are stored on the same Queue so they survive a restart; idempotent
// adds (same job name + cron pattern + tz) replace the existing schedule rather
// than duplicating it.

const DAILY_CRON_DEFAULT = '0 9 * * *'; // 09:00 every day
const WEEKLY_CRON_DEFAULT = '0 9 * * 1'; // 09:00 every Monday
const TZ = process.env.JOB_ALERTS_CRON_TZ ?? 'Asia/Kolkata';

@Injectable()
export class AlertsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(private readonly queueSvc: AlertsQueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.JOB_ALERTS_DISABLED === '1') return;
    const queue = this.queueSvc.getQueue();
    if (!queue) {
      this.logger.warn('alerts queue offline at scheduler bootstrap — skipping');
      return;
    }
    const daily = process.env.JOB_ALERTS_DAILY_CRON ?? DAILY_CRON_DEFAULT;
    const weekly = process.env.JOB_ALERTS_WEEKLY_CRON ?? WEEKLY_CRON_DEFAULT;

    await queue.add(
      JOB_NAMES.SCAN_FREQUENCY,
      { frequency: 'daily' },
      { repeat: { pattern: daily, tz: TZ }, jobId: 'sweep-daily' },
    );
    await queue.add(
      JOB_NAMES.SCAN_FREQUENCY,
      { frequency: 'weekly' },
      { repeat: { pattern: weekly, tz: TZ }, jobId: 'sweep-weekly' },
    );

    this.logger.log(`registered repeatables: daily=${daily}, weekly=${weekly}, tz=${TZ}`);
  }
}
