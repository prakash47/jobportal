import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type Application, type ApplicationStatus } from '@jobportal/db';
import { EmailService } from '../email/email.service';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';
import { ApplicationQuotaService } from './quota.service';
import { buildHistoryEntry, canTransition, isTerminal } from './state-machine';

const PAGE_SIZE = 20;

export interface ApplicationListRow {
  id: number;
  status: ApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  job: {
    id: number;
    title: string;
    canonicalSlug: string;
    status: string;
    company: { id: number; name: string; slug: string };
  };
}

export interface ApplicationListPage {
  hits: ApplicationListRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly email: EmailService,
    private readonly quota: ApplicationQuotaService,
    private readonly notifications: NotificationsProducerService,
  ) {}

  async apply(userId: number, jobId: number, coverLetter?: string): Promise<Application> {
    // FR-4.12.8: email verification gates apply.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email before applying.');
    }

    // FR-4.2.5 + 4.2.7: only ACTIVE jobs accept applications.
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        title: true,
        canonicalSlug: true,
        // Recruiter who owns the job — the recipient of the new-application
        // bell notification (nullable: poster may have been removed).
        postedById: true,
        company: { select: { name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `This job is ${job.status.toLowerCase()} and no longer accepts applications.`,
      );
    }

    // FR-4.2.6: UNIQUE(userId, jobId) — friendly 409, not 500. We check this
    // BEFORE quota.consume so a duplicate-apply attempt does not cost a slot
    // (Day 0 decision (a) per the PR plan).
    let created: Application;
    try {
      created = await prisma.application.create({
        data: {
          userId,
          jobId,
          status: 'APPLIED',
          ...(coverLetter ? { coverLetter } : {}),
        },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        throw new ConflictException('You have already applied to this job.');
      }
      throw err;
    }

    // Layer 3 of three-layer enforcement (CLAUDE.md §4 / SRS §4.11.16-17).
    // Atomically increments the day counter; throws 429 if a race put us
    // over the limit between the L1 preflight and here. On failure, roll
    // back the Application row so the user does not consume a slot for an
    // attempt the API ultimately rejected. If the rollback delete itself
    // fails (rare — Postgres blip, FK race), log loudly: the user has an
    // orphan row their dashboard will show, ops needs to know.
    try {
      await this.quota.consume(userId);
    } catch (err) {
      try {
        await prisma.application.delete({ where: { id: created.id } });
      } catch (rollbackErr) {
        this.logger.error(
          `quota rollback failed: orphan application ${created.id} for user ${userId} ` +
            `— ${(rollbackErr as Error).message}`,
        );
      }
      throw err;
    }

    // SRS §4.13 — confirmation to the candidate. Fire-and-log so a Resend
    // outage cannot turn a successful apply into a 5xx. The .catch handler
    // keeps a Redis blip from leaking as an unhandled rejection.
    const webBase = process.env.WEB_URL ?? 'http://localhost:3000';
    this.email
      .enqueueApplicationSubmitted(user.email, userId, {
        jobTitle: job.title,
        companyName: job.company.name,
        applicationUrl: `${webBase}/applications/${created.id}`,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `application-submitted enqueue failed for application ${created.id}: ${(err as Error).message}`,
        );
      });

    // Recruiter-side in-app notification (the bell). Fire-and-log: a write
    // failure here must never turn a successful apply into a 5xx, and it never
    // alters the candidate-facing flow. Recipient is the job owner (postedById).
    this.notifications
      .notifyNewApplication({
        recruiterUserId: job.postedById,
        jobId,
        jobTitle: job.title,
        candidateName: user.name,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `new-application notification failed for application ${created.id}: ${(err as Error).message}`,
        );
      });

    return created;
  }

  // SRS §4.6.1 — paginated dashboard list joined with Job + Company so the
  // /applications page renders in a single SSR query.
  async list(
    userId: number,
    filter: { status?: ApplicationStatus | 'ALL' | undefined; page?: number | undefined },
  ): Promise<ApplicationListPage> {
    const page = filter.page ?? 1;
    const where: Prisma.ApplicationWhereInput = { userId };
    if (filter.status && filter.status !== 'ALL') {
      where.status = filter.status;
    }

    const [hits, total] = await Promise.all([
      prisma.application.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          status: true,
          appliedAt: true,
          updatedAt: true,
          job: {
            select: {
              id: true,
              title: true,
              canonicalSlug: true,
              status: true,
              company: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      prisma.application.count({ where }),
    ]);

    return { hits, total, page, pageSize: PAGE_SIZE };
  }

  // SRS §4.6.2 — candidate-driven WITHDRAW transition. State machine enforces
  // that only non-terminal rows can be withdrawn; the unique (userId, id)
  // ownership check makes a cross-user withdraw 404 (not 403) so we don't
  // leak whether the row exists.
  async withdraw(userId: number, applicationId: number): Promise<Application> {
    const existing = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        status: true,
        statusHistory: true,
        job: {
          select: {
            title: true,
            company: { select: { name: true } },
          },
        },
        user: { select: { email: true } },
      },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Application not found');
    }
    if (isTerminal(existing.status)) {
      throw new ForbiddenException(
        `This application is already ${existing.status.toLowerCase()}; cannot withdraw.`,
      );
    }
    if (!canTransition(existing.status, 'WITHDRAWN', 'CANDIDATE')) {
      throw new ForbiddenException('Withdraw is not allowed from this state.');
    }

    const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
    const entry = buildHistoryEntry(existing.status, 'WITHDRAWN', 'CANDIDATE');
    const nextHistory = [...history, entry];

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'WITHDRAWN',
        statusHistory: nextHistory as unknown as Prisma.InputJsonValue,
      },
    });

    // Fire-and-log; don't block the response on email backend latency.
    const webBase = process.env.WEB_URL ?? 'http://localhost:3000';
    this.email
      .enqueueApplicationStatusChange(existing.user.email, userId, {
        jobTitle: existing.job.title,
        companyName: existing.job.company.name,
        from: existing.status,
        to: 'WITHDRAWN',
        applicationUrl: `${webBase}/applications/${applicationId}`,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `withdraw status-change enqueue failed for application ${applicationId}: ${(err as Error).message}`,
        );
      });

    return updated;
  }

  findUserApplication(userId: number, jobId: number): Promise<Application | null> {
    return prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }
}
