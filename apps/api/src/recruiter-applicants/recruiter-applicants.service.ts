import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type Application, type ApplicationStatus } from '@jobportal/db';
import { buildHistoryEntry, canTransition } from '../applications/state-machine';
import { EmailService } from '../email/email.service';
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

  // SRS §4.9.6 — applicants for a job the recruiter owns. Cross-job 404 (no
  // existence leak), same pattern as candidate-side ownership checks.
  async list(userId: number, jobId: number, query: ListApplicantsQuery) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, postedById: true, title: true },
    });
    if (!job || job.postedById !== userId) {
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

  // Owner check: the recruiter owns the JOB the application belongs to.
  // Returns the loaded application + side-data needed by the action paths
  // so the caller doesn't re-query.
  private async ownedApplicationOrThrow(userId: number, applicationId: number) {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        statusHistory: true,
        recruiterNotes: true,
        job: {
          select: { id: true, postedById: true, title: true, company: { select: { name: true } } },
        },
        user: { select: { email: true } },
      },
    });
    if (!app || app.job.postedById !== userId) {
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
    const app = await this.ownedApplicationOrThrow(userId, applicationId);

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

    // Fire-and-log: don't block the recruiter's response on email backend
    // latency. The `.catch` keeps the unhandledRejection out of stdout.
    this.email
      .sendApplicationStatusChange(app.user.email, {
        jobTitle: app.job.title,
        companyName: app.job.company.name,
        from: app.status,
        to: toStatus,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `status-change email failed for application ${applicationId}: ${
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
    await this.ownedApplicationOrThrow(userId, applicationId);
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { recruiterNotes: notes.length === 0 ? null : notes },
      select: { recruiterNotes: true },
    });
    return { recruiterNotes: updated.recruiterNotes ?? '' };
  }

  // SRS §4.9.6 — open the candidate's resume. Returns a 15-min signed URL
  // for the candidate's activeResume; 404 when the candidate has none.
  async getResumeUrl(
    userId: number,
    applicationId: number,
  ): Promise<{ url: string; expiresInSeconds: number; filename: string }> {
    const app = await this.ownedApplicationOrThrow(userId, applicationId);
    const candidate = await prisma.candidate.findUnique({
      where: { userId: (await prisma.application.findUnique({
        where: { id: app.id },
        select: { userId: true },
      }))!.userId },
      select: { activeResume: true },
    });
    if (!candidate?.activeResume || candidate.activeResume.deletedAt !== null) {
      throw new NotFoundException('Candidate has no resume on file');
    }
    if (candidate.activeResume.scanStatus !== 'CLEAN') {
      throw new ForbiddenException('Resume is still being scanned');
    }
    const url = await this.storage.getSignedDownloadUrl(candidate.activeResume.r2Key, 15 * 60);
    return {
      url,
      expiresInSeconds: 15 * 60,
      filename: candidate.activeResume.originalFilename,
    };
  }
}
