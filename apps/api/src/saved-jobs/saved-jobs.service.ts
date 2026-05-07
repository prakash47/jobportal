import { Injectable } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { SavedJob } from '@jobportal/db';

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
}
