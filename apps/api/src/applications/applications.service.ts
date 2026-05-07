import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { Application } from '@jobportal/db';

@Injectable()
export class ApplicationsService {
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

  findUserApplication(userId: number, jobId: number): Promise<Application | null> {
    return prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }
}
