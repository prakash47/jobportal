import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type Application, type ApplicationStatus } from '@jobportal/db';
import { buildHistoryEntry, canTransition } from '../applications/state-machine';
import { EmailService } from '../email/email.service';
import { jobManageableWhere } from '../recruiter-jobs/job-access';
import { StorageService } from '../storage/storage.service';
import type { ListApplicantsQuery } from './dto';

const PAGE_SIZE = 20;

@Injectable()
export class RecruiterApplicantsService {
  private readonly logger = new Logger(RecruiterApplicantsService.name);

  constructor(
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {}

  // SRS §4.9.6 — applicants for a job the recruiter owns OR collaborates on
  // (Collaborate → "respond to this job"). Cross-job 404 (no existence leak),
  // same pattern as candidate-side ownership checks.
  async list(userId: number, jobId: number, query: ListApplicantsQuery) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, ...jobManageableWhere(userId) },
      select: { id: true, title: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const page = query.page ?? 1;
    const sort = query.sort ?? 'date';

    const [hits, total] = await Promise.all([
      prisma.application.findMany({
        where: { jobId },
        orderBy:
          sort === 'status' ? [{ status: 'asc' }, { appliedAt: 'desc' }] : { appliedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          status: true,
          appliedAt: true,
          recruiterNotes: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              candidate: {
                select: {
                  headline: true,
                  experienceMonths: true,
                  currentTitle: true,
                  expectedSalaryMinPaise: true,
                  expectedSalaryMaxPaise: true,
                  activeResumeId: true,
                },
              },
            },
          },
        },
      }),
      prisma.application.count({ where: { jobId } }),
    ]);

    return { job: { id: job.id, title: job.title }, hits, total, page, pageSize: PAGE_SIZE };
  }

  // Access check: the recruiter owns OR collaborates on the JOB the application
  // belongs to (Collaborate → "respond to this job"). Returns the loaded
  // application + side-data needed by the action paths (incl. the candidate's
  // userId so getResumeUrl doesn't re-query). The `collaborators` sub-select is
  // filtered to this user, so a non-empty array means an active collaborator row.
  private async manageableApplicationOrThrow(userId: number, applicationId: number) {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        status: true,
        statusHistory: true,
        recruiterNotes: true,
        // The resume snapshot (ADR 0002 decision 7). Null on applications that
        // predate the column; getResumeUrl falls back for those.
        resumeId: true,
        job: {
          select: {
            id: true,
            postedById: true,
            title: true,
            company: { select: { name: true } },
            collaborators: { where: { userId }, select: { userId: true }, take: 1 },
          },
        },
        user: { select: { email: true } },
      },
    });
    if (!app || (app.job.postedById !== userId && app.job.collaborators.length === 0)) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  // SRS §4.9.6 — recruiter-driven state machine transition. Mirrors the
  // candidate WITHDRAW path but with actor='RECRUITER'. Sends the candidate
  // an email on every successful transition (Task 12 email infra).
  async transition(
    userId: number,
    applicationId: number,
    toStatus: ApplicationStatus,
  ): Promise<Application> {
    const app = await this.manageableApplicationOrThrow(userId, applicationId);

    if (!canTransition(app.status, toStatus, 'RECRUITER')) {
      throw new ForbiddenException(
        `Cannot transition ${app.status} → ${toStatus} as recruiter`,
      );
    }

    const history = Array.isArray(app.statusHistory) ? app.statusHistory : [];
    const entry = buildHistoryEntry(app.status, toStatus, 'RECRUITER');
    const nextHistory = [...history, entry];

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: toStatus,
        statusHistory: nextHistory as unknown as Prisma.InputJsonValue,
      },
    });

    // Fire-and-log: enqueue is fast (Redis push) but a Redis blip should
    // not turn a successful state-machine transition into a 5xx for the
    // recruiter. The `.catch` keeps unhandledRejection out of stdout.
    const webBase = process.env.WEB_URL ?? 'http://localhost:3000';
    this.email
      .enqueueApplicationStatusChange(app.user.email, app.userId, {
        jobTitle: app.job.title,
        companyName: app.job.company.name,
        from: app.status,
        to: toStatus,
        applicationUrl: `${webBase}/applications/${applicationId}`,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `status-change email enqueue failed for application ${applicationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return updated;
  }

  async setNotes(
    userId: number,
    applicationId: number,
    notes: string,
  ): Promise<{ recruiterNotes: string }> {
    await this.manageableApplicationOrThrow(userId, applicationId);
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { recruiterNotes: notes.length === 0 ? null : notes },
      select: { recruiterNotes: true },
    });
    return { recruiterNotes: updated.recruiterNotes ?? '' };
  }

  // SRS §4.9.6 — open the resume that was SUBMITTED with this application.
  // Returns a 15-min signed URL; 404 when there is nothing to serve.
  //
  // ADR 0002 decision 7. This used to resolve `Candidate.activeResume` — the
  // candidate's CURRENT CV — which meant a candidate replacing their CV
  // silently rewrote what every recruiter saw for every application already
  // sent, and soft-deleting it turned them all into "no resume on file". A
  // submitted document must not change after submission.
  //
  // The fallback is not defensive coding, it is the permanent state of the
  // rows that predate the column: which CV was actually sent is genuinely
  // unknown for them, so they keep the old behaviour rather than 404-ing an
  // application a recruiter could read yesterday. New applications always
  // carry a snapshot, so they never take this path.
  //
  // A soft-deleted resume IS still served when it is the snapshot: the
  // recruiter already received that document, and withdrawing it retroactively
  // would break a review in progress. The deleted-check therefore only guards
  // the legacy fallback, where "current CV" is the only meaning available.
  async getResumeUrl(
    userId: number,
    applicationId: number,
  ): Promise<{ url: string; expiresInSeconds: number; filename: string }> {
    const app = await this.manageableApplicationOrThrow(userId, applicationId);

    const snapshot = app.resumeId
      ? await prisma.resume.findUnique({
          where: { id: app.resumeId },
          select: { r2Key: true, originalFilename: true, scanStatus: true },
        })
      : null;

    let resume: { r2Key: string; originalFilename: string; scanStatus: string } | null = snapshot;
    if (!resume) {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: app.userId },
        select: { activeResume: true },
      });
      const active = candidate?.activeResume;
      resume = active && active.deletedAt === null ? active : null;
    }

    if (!resume) throw new NotFoundException('Candidate has no resume on file');
    if (resume.scanStatus !== 'CLEAN') {
      throw new ForbiddenException('Resume is still being scanned');
    }

    const url = await this.storage.getSignedDownloadUrl(resume.r2Key, 15 * 60);
    return { url, expiresInSeconds: 15 * 60, filename: resume.originalFilename };
  }
}
