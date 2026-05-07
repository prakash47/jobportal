import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
import { recomputeCompleteness } from './profile.service';

@Injectable()
export class ProfileSkillsService {
  async update(userId: number, skillIds: number[]): Promise<{ skillIds: number[] }> {
    // Validate that all referenced skills exist; reject the whole update
    // otherwise (no partial application).
    if (skillIds.length > 0) {
      const found = await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true },
      });
      if (found.length !== new Set(skillIds).size) {
        throw new NotFoundException('One or more skill IDs do not exist');
      }
    }

    const before = await prisma.candidate.findUnique({
      where: { userId },
      select: { skillIds: true },
    });
    if (!before) throw new NotFoundException('Candidate profile not found');

    const sorted = [...new Set(skillIds)].sort((a, b) => a - b);
    await prisma.candidate.update({
      where: { userId },
      data: { skillIds: sorted },
    });

    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'SKILLS_UPDATE',
        diff: {
          before: before.skillIds,
          after: sorted,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await recomputeCompleteness(userId);
    return { skillIds: sorted };
  }
}
