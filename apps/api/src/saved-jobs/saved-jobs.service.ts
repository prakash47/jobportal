import { Injectable } from '@nestjs/common';
import { prisma, type ApplicationStatus, type SavedJob } from '@jobportal/db';

const PAGE_SIZE = 20;

export interface SavedJobListRow {
  jobId: number;
  savedAt: Date;
  job: {
    id: number;
    title: string;
    canonicalSlug: string;
    status: string;
    company: { id: number; name: string; slug: string };
  };
  // Per-row applied marker so the dashboard can hide the Apply CTA on jobs
  // the candidate has already applied to.
  applied: boolean;
  appliedStatus: ApplicationStatus | null;
}

export interface SavedJobListPage {
  hits: SavedJobListRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class SavedJobsService {
  async save(userId: number, jobId: number): Promise<SavedJob> {
    try {
      return await prisma.savedJob.create({ data: { userId, jobId } });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // P2002: UNIQUE constraint — already saved. Return existing row (idempotent).
      if (code === 'P2002') {
        const existing = await prisma.savedJob.findUnique({
          where: { userId_jobId: { userId, jobId } },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async unsave(userId: number, jobId: number): Promise<{ deleted: number }> {
    const res = await prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { deleted: res.count };
  }

  findUserSaved(userId: number, jobId: number): Promise<SavedJob | null> {
    return prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }

  // SRS §4.4 — paginated list joined with Job + Company. Also fetches the
  // user's Application rows for the same jobs so the UI can pre-mark "applied".
  async list(
    userId: number,
    opts: { page?: number | undefined } = {},
  ): Promise<SavedJobListPage> {
    const page = opts.page ?? 1;

    const [savedRows, total] = await Promise.all([
      prisma.savedJob.findMany({
        where: { userId },
        orderBy: { savedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          jobId: true,
          savedAt: true,
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
      prisma.savedJob.count({ where: { userId } }),
    ]);

    const jobIds = savedRows.map((r) => r.jobId);
    const applications = jobIds.length
      ? await prisma.application.findMany({
          where: { userId, jobId: { in: jobIds } },
          select: { jobId: true, status: true },
        })
      : [];
    const appliedByJobId = new Map<number, ApplicationStatus>();
    for (const a of applications) appliedByJobId.set(a.jobId, a.status);

    const hits: SavedJobListRow[] = savedRows.map((r) => ({
      jobId: r.jobId,
      savedAt: r.savedAt,
      job: r.job,
      applied: appliedByJobId.has(r.jobId),
      appliedStatus: appliedByJobId.get(r.jobId) ?? null,
    }));

    return { hits, total, page, pageSize: PAGE_SIZE };
  }
}
