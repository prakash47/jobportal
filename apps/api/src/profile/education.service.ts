import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, type Education } from '@jobportal/db';
import { recomputeCompleteness } from './profile.service';
import { stripUndefined } from './strip-undefined';
import type { EducationCreateInput, EducationUpdateInput } from './dto';

@Injectable()
export class EducationService {
  async list(userId: number): Promise<Education[]> {
    const candidate = await this.candidateOrThrow(userId);
    return prisma.education.findMany({
      where: { candidateId: candidate.id },
      orderBy: [{ endYear: 'desc' }, { startYear: 'desc' }],
    });
  }

  async create(userId: number, input: EducationCreateInput): Promise<Education> {
    const candidate = await this.candidateOrThrow(userId);
    const row = await prisma.education.create({
      data: stripUndefined({ candidateId: candidate.id, ...input }) as Prisma.EducationUncheckedCreateInput,
    });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EDUCATION_ADD',
        diff: { educationId: row.id, after: input } as unknown as Prisma.InputJsonValue,
      },
    });
    await recomputeCompleteness(userId);
    return row;
  }

  async update(userId: number, id: number, input: EducationUpdateInput): Promise<Education> {
    await this.ownsOrThrow(userId, id);
    const before = await prisma.education.findUniqueOrThrow({ where: { id } });
    const row = await prisma.education.update({
      where: { id },
      data: stripUndefined(input) as Prisma.EducationUpdateInput,
    });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EDUCATION_UPDATE',
        diff: { educationId: id, before, after: input } as unknown as Prisma.InputJsonValue,
      },
    });
    return row;
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.ownsOrThrow(userId, id);
    const before = await prisma.education.findUniqueOrThrow({ where: { id } });
    await prisma.education.delete({ where: { id } });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EDUCATION_DELETE',
        diff: { educationId: id, before } as unknown as Prisma.InputJsonValue,
      },
    });
    await recomputeCompleteness(userId);
  }

  private async candidateOrThrow(userId: number): Promise<{ id: number }> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate profile not found');
    return candidate;
  }

  private async ownsOrThrow(userId: number, educationId: number): Promise<void> {
    const row = await prisma.education.findUnique({
      where: { id: educationId },
      select: { candidate: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('Education entry not found');
    if (row.candidate.userId !== userId) {
      throw new ForbiddenException('You do not own this education entry');
    }
  }
}
