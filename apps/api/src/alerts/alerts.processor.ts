import { Injectable, Logger } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';
import { searchJobs, type JobDoc, type SearchJobsParams } from '@jobportal/search';
import { EmailService } from '../email/email.service';
import { buildAlertEmail, type AlertEmailJob } from './email-template';

export const JOB_NAMES = {
  SCAN_ALERT: 'scan-alert',
  SCAN_FREQUENCY: 'scan-frequency',
} as const;

export interface ScanAlertJobData {
  alertId: number;
}

const KILLSWITCH_FLAG = 'killswitch.job_alerts';
const MAX_JOBS_PER_EMAIL = 20;
const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.5.4 — converts the saved Prisma job row into the per-row shape the
// email template wants. Kept tiny; no formatting beyond the salary string
// (mirrors apps/web's JobCard helper for visual consistency).
function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const toLpa = (v: number) => {
    const lakhs = v / 10_000_000; // paise → lakhs
    if (lakhs >= 100) return `${(lakhs / 100).toFixed(1)} Cr`;
    return `${lakhs.toFixed(1)} L`;
  };
  if (min !== null && max !== null) return `₹${toLpa(min)} – ₹${toLpa(max)}`;
  if (min !== null) return `₹${toLpa(min)}+`;
  return `up to ₹${toLpa(max as number)}`;
}

function jobDocToEmailJob(j: JobDoc): AlertEmailJob {
  return {
    title: j.title,
    companyName: j.companyName,
    canonicalSlug: j.canonicalSlug,
    primaryCity: j.primaryCitySlug ? j.primaryCitySlug.replaceAll('-', ' ') : null,
    salary: formatSalary(j.salaryMin, j.salaryMax),
  };
}

interface AlertQueryShape {
  q?: string;
  skillSlugs?: string[];
  citySlugs?: string[];
  minExperienceMonths?: number;
  maxExperienceMonths?: number;
  salaryMin?: number;
}

function toSearchParams(query: AlertQueryShape): SearchJobsParams {
  const params: SearchJobsParams = { status: 'ACTIVE', sort: 'recent', pageSize: MAX_JOBS_PER_EMAIL };
  if (query.q) params.q = query.q;
  if (query.skillSlugs?.length) params.skillSlugs = query.skillSlugs;
  if (query.citySlugs?.length) params.citySlugs = query.citySlugs;
  if (query.minExperienceMonths !== undefined) params.minExperienceMonths = query.minExperienceMonths;
  if (query.maxExperienceMonths !== undefined) params.maxExperienceMonths = query.maxExperienceMonths;
  if (query.salaryMin !== undefined) params.salaryMin = query.salaryMin;
  return params;
}

@Injectable()
export class AlertsProcessor {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(private readonly email: EmailService) {}

  // SRS §4.5 — scan one alert and (if there are new matches) email the user.
  // Idempotent: re-running with the same DB state is a no-op because the
  // dedupe set in lastSentJobIds covers everything that was emailed.
  async scanAlert(alertId: number): Promise<{ sent: boolean; matched: number; newCount: number }> {
    // Layer 1 of three-layer killswitch — the worker checks on every job.
    if (await isFlagEnabled(KILLSWITCH_FLAG)) {
      this.logger.log(`killswitch ON — skipping alert ${alertId}`);
      return { sent: false, matched: 0, newCount: 0 };
    }

    const alert = await prisma.jobAlert.findUnique({
      where: { id: alertId },
      include: {
        user: {
          select: {
            email: true,
            emailPreference: { select: { jobAlertsEnabled: true } },
          },
        },
      },
    });
    if (!alert) {
      this.logger.warn(`alert ${alertId} not found — likely deleted between enqueue and run`);
      return { sent: false, matched: 0, newCount: 0 };
    }
    if (!alert.isActive) {
      return { sent: false, matched: 0, newCount: 0 };
    }
    // EmailPreference.jobAlertsEnabled defaults to true and is lazily
    // provisioned; treat a missing row as enabled.
    if (alert.user.emailPreference && !alert.user.emailPreference.jobAlertsEnabled) {
      this.logger.log(`user ${alert.userId} disabled job-alert emails — skipping ${alertId}`);
      return { sent: false, matched: 0, newCount: 0 };
    }

    const query = (alert.query ?? {}) as AlertQueryShape;
    const results = await searchJobs(toSearchParams(query));
    const matchedIds = new Set<number>(results.hits.map((j) => j.id));

    // Dedupe — anything in lastSentJobIds was already emailed.
    const alreadySent = new Set<number>(alert.lastSentJobIds);
    const newJobs = results.hits.filter((j) => !alreadySent.has(j.id));
    if (newJobs.length === 0) {
      this.logger.log(`alert ${alertId}: ${results.hits.length} matches, 0 new — no email`);
      return { sent: false, matched: results.hits.length, newCount: 0 };
    }

    const emailPayload = buildAlertEmail({
      alertName: alert.name,
      jobs: newJobs.map(jobDocToEmailJob),
      manageAlertsUrl: `${SITE}/alerts`,
      unsubscribeUrl: `${SITE}/alerts/unsubscribe/${alert.unsubscribeToken}`,
      jobUrlPrefix: `${SITE}/job`,
      searchUrl: `${SITE}/jobs`,
    });

    await this.email.sendJobAlert(alert.user.email, emailPayload);

    // Persist the dedupe state AFTER successful send. On send failure BullMQ
    // will retry; the dedupe set is unchanged so the same matches go again.
    // Cap the persisted set size to avoid Postgres array bloat over time.
    const persistedIds = [...alreadySent, ...newJobs.map((j) => j.id)].slice(-500);
    await prisma.jobAlert.update({
      where: { id: alertId },
      data: {
        lastSentJobIds: persistedIds,
        lastSentAt: new Date(),
        lastRunAt: new Date(),
      },
    });

    return { sent: true, matched: matchedIds.size, newCount: newJobs.length };
  }

  // SRS §4.5.2 — fan-out helper. The scheduler enqueues one
  // 'scan-frequency' job per cron tick; the worker enqueues one 'scan-alert'
  // job per matching active alert.
  async scanFrequency(payload: { frequency: string }): Promise<void> {
    if (await isFlagEnabled(KILLSWITCH_FLAG)) {
      this.logger.log(`killswitch ON — skipping ${payload.frequency} sweep`);
      return;
    }
    const alerts = await prisma.jobAlert.findMany({
      where: { isActive: true, frequency: payload.frequency },
      select: { id: true },
    });
    this.logger.log(`scan-frequency=${payload.frequency} → ${alerts.length} active alerts`);
    // Fan out via direct calls — same Worker handles them in sequence. For a
    // 10k-alert future scale we'd swap to a parallel queue add; keep simple
    // here.
    for (const a of alerts) {
      try {
        await this.scanAlert(a.id);
      } catch (err) {
        this.logger.error(`scanAlert(${a.id}) crashed: ${(err as Error).message}`);
      }
    }
  }

  // Suppress unused-import warning for Prisma when the union type isn't read.
  static get _prismaSentinel(): typeof Prisma {
    return Prisma;
  }
}
