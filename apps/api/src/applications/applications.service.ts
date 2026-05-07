import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type Application, type ApplicationStatus } from '@jobportal/db';
import { EmailService } from '../email/email.service';
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
  constructor(private readonly email: EmailService) {}

  async apply(userId: number, jobId: number, coverLetter?: string): Promise<Application> {
    // FR-4.12.8: email verification gates apply.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email before applying.');
    }

    // FR-4.2.5 + 4.2.7: only ACTIVE jobs accept applications.
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `This job is ${job.status.toLowerCase()} and no longer accepts applications.`,
      );
    }

    // FR-4.2.6: UNIQUE(userId, jobId) — friendly 409, not 500.
    try {
      return await prisma.application.create({
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
    void this.email.sendApplicationStatusChange(existing.user.email, {
      jobTitle: existing.job.title,
      companyName: existing.job.company.name,
      from: existing.status,
      to: 'WITHDRAWN',
    });

    return updated;
  }

  findUserApplication(userId: number, jobId: number): Promise<Application | null> {
    return prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }
}
