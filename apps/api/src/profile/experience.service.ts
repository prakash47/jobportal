import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, type WorkExperience } from '@jobportal/db';
import { recomputeCompleteness } from './profile.service';
import { stripUndefined } from './strip-undefined';
import type { ExperienceCreateInput, ExperienceUpdateInput } from './dto';

function toDates(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = stripUndefined(input);
  if (typeof out['startDate'] === 'string') out['startDate'] = new Date(out['startDate'] as string);
  if (typeof out['endDate'] === 'string') out['endDate'] = new Date(out['endDate'] as string);
  return out;
}

@Injectable()
export class ExperienceService {
  async list(userId: number): Promise<WorkExperience[]> {
    const candidate = await this.candidateOrThrow(userId);
    return prisma.workExperience.findMany({
      where: { candidateId: candidate.id },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    });
  }

  async create(userId: number, input: ExperienceCreateInput): Promise<WorkExperience> {
    const candidate = await this.candidateOrThrow(userId);
    const row = await prisma.workExperience.create({
      data: {
        candidateId: candidate.id,
        ...toDates(input),
      } as unknown as Prisma.WorkExperienceUncheckedCreateInput,
    });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EXPERIENCE_ADD',
        diff: { experienceId: row.id, after: input } as unknown as Prisma.InputJsonValue,
      },
    });
    await recomputeCompleteness(userId);
    return row;
  }

  async update(
    userId: number,
    id: number,
    input: ExperienceUpdateInput,
  ): Promise<WorkExperience> {
    await this.ownsOrThrow(userId, id);
    const before = await prisma.workExperience.findUniqueOrThrow({ where: { id } });
    const row = await prisma.workExperience.update({
      where: { id },
      data: toDates(input) as unknown as Prisma.WorkExperienceUpdateInput,
    });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EXPERIENCE_UPDATE',
        diff: {
          experienceId: id,
          before,
          after: input,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return row;
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.ownsOrThrow(userId, id);
    const before = await prisma.workExperience.findUniqueOrThrow({ where: { id } });
    await prisma.workExperience.delete({ where: { id } });
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'EXPERIENCE_DELETE',
        diff: { experienceId: id, before } as unknown as Prisma.InputJsonValue,
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

  private async ownsOrThrow(userId: number, experienceId: number): Promise<void> {
    const row = await prisma.workExperience.findUnique({
      where: { id: experienceId },
      select: { candidate: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('Experience entry not found');
    if (row.candidate.userId !== userId) {
      throw new ForbiddenException('You do not own this experience entry');
    }
  }
}
