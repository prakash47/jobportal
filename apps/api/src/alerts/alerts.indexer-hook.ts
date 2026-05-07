import { Injectable, Logger } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { AlertsQueueService } from './alerts.queue';

// SRS §4.5.2 — instant-frequency trigger. When a Job row is freshly indexed
// into Elasticsearch, fan out one scanAlert(id) job per active alert with
// frequency='instant'. The dedupe path inside scanAlert ensures we only email
// the user about jobs they have not already been emailed about.
//
// NOTE: this hook has no caller in the codebase yet — the indexer entry
// points are added in feature/recruiter-job-posting (Task 15). The function
// is wired through the module's exports so when that PR lands it can simply
// inject AlertsIndexerHook and call onJobIndexed(jobId).

const KILLSWITCH_FLAG = 'killswitch.job_alerts';

@Injectable()
export class AlertsIndexerHook {
  private readonly logger = new Logger(AlertsIndexerHook.name);

  constructor(private readonly queue: AlertsQueueService) {}

  async onJobIndexed(_jobId: number): Promise<void> {
    if (await isFlagEnabled(KILLSWITCH_FLAG)) return;
    const alerts = await prisma.jobAlert.findMany({
      where: { isActive: true, frequency: 'instant' },
      select: { id: true },
    });
    if (alerts.length === 0) return;
    this.logger.log(`onJobIndexed → ${alerts.length} instant alerts to scan`);
    for (const a of alerts) {
      await this.queue.enqueueScan(a.id);
    }
  }
}
