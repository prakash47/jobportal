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

/**
 * Stable error codes on the apply 403s (ADR 0002 decision 7).
 *
 * Exported so the tests assert the same constant the service emits rather than
 * a re-typed string literal — a test that hardcodes 'RESUME_REQUIRED' still
 * passes after a typo is introduced here, since both sides would be strings
 * nobody compares. These values are part of the client contract: apps/web
 * routes on them and the Flutter app branches on them, so treat a change here
 * as a breaking API change, not a rename.
 */
export const RESUME_REQUIRED = 'RESUME_REQUIRED';
export const RESUME_SCANNING = 'RESUME_SCANNING';

export interface ApplicationListRow {
  id: number;
  status: ApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  /**
   * The transitions this application has been through, oldest first.
   *
   * Raw `Application.statusHistory`, coalesced from `null` to `[]` so a client
   * never has to null-check before iterating. Entries are authored by
   * `buildHistoryEntry` as `{ from, to, at, by }` — note it is `to` that names
   * the status REACHED at `at`, which is what a timeline renders.
   *
   * Legacy and seeded rows can be empty: applications created before the
   * column existed never recorded one, so a timeline should synthesise the
   * APPLIED step rather than assume this is populated.
   */
  statusHistory: unknown[];
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
  /**
   * Per-status totals across ALL of this user's applications.
   *
   * Deliberately INDEPENDENT of `?status=`: these drive the filter chips, so
   * deriving them from the filtered page would make every chip read the count
   * of whichever filter is already active. `ALL` is always present and is the
   * sum; statuses with zero applications are OMITTED, because groupBy only
   * returns non-empty groups and the UI hides empty chips anyway.
   */
  counts: Record<string, number>;
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
      // Never interpolate the raw Postgres enum into user-facing copy: it leaks
      // internal vocabulary ("pending_moderation") and the old "no longer"
      // wording was factually wrong for a job that was never live in the first
      // place — which is exactly the case for a job awaiting moderation.
      throw new ForbiddenException(
        job.status === 'PENDING_MODERATION' || job.status === 'DRAFT'
          ? 'This job is not open for applications yet.'
          : 'This job is no longer accepting applications.',
      );
    }

    // ADR 0002 decision 7: a CV is required, and the one used is recorded.
    //
    // Ordering is deliberate. This sits AFTER the job checks, so someone
    // applying to a closed job is told about the job rather than sent off to
    // upload a document that would not have helped. It sits BEFORE the create,
    // so a rejected apply cannot leave a row behind, and therefore before
    // quota.consume, so it cannot cost a slot.
    //
    // The known consequence: a duplicate apply by a candidate with no CV now
    // answers "upload a CV" rather than 409, because the duplicate check IS the
    // create below (P2002). Accepted — after this ships, holding a CV is a
    // precondition for the whole flow.
    //
    // `candidate` may be null: the Candidate profile row is provisioned lazily
    // on the first /profile read, so a user who registered and never opened
    // their profile has none. That is "no resume", not an error.
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: {
        activeResume: { select: { id: true, scanStatus: true, deletedAt: true } },
      },
    });
    // Both carry a machine-readable `code`. Neither client can be asked to
    // match on English: apps/web needs to route the user to the upload page,
    // and the Flutter app cannot string-match a message we may reword. The
    // envelope is additive by design (common/http-error-envelope.ts) and the
    // quota 429's `upgradeAvailable` is the existing precedent.
    const resume = candidate?.activeResume;
    if (!resume || resume.deletedAt !== null) {
      throw new ForbiddenException({
        message: 'Upload your resume before applying.',
        code: RESUME_REQUIRED,
      });
    }
    if (resume.scanStatus !== 'CLEAN') {
      // Distinct code AND message: this one resolves by waiting, not by
      // uploading, so sending the user to the upload page would be wrong.
      throw new ForbiddenException({
        message: 'Your resume is still being scanned. Try again in a moment.',
        code: RESUME_SCANNING,
      });
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
          // The snapshot. Read inside apply() rather than passed in by the
          // caller, so a client cannot nominate someone else's document.
          resumeId: resume.id,
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

    const [rows, total, statusGroups] = await Promise.all([
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
          statusHistory: true,
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
      // NOT filtered by `where` — see the `counts` doc above. Scoped to the
      // caller either way, so this can never count another user's rows.
      prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    let all = 0;
    for (const g of statusGroups) {
      counts[g.status] = g._count._all;
      all += g._count._all;
    }
    counts['ALL'] = all;

    const hits: ApplicationListRow[] = rows.map((r) => ({
      ...r,
      // The column is `Json?`. A null becomes [], and a non-array value (which
      // the schema permits but nothing writes) is treated as no history rather
      // than shipped as a shape the client cannot iterate.
      statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : [],
    }));

    return { hits, counts, total, page, pageSize: PAGE_SIZE };
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
