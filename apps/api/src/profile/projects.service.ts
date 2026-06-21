import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { ProjectCreateInput } from './dto';

@Injectable()
export class ProjectsService {
  async list(userId: number) {
    const candidate = await this.requireCandidate(userId);
    return prisma.project.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: number, input: ProjectCreateInput) {
    const candidate = await this.requireCandidate(userId);
    return prisma.project.create({
      data: {
        candidateId: candidate.id,
        title: input.title,
        techStack: input.techStack ?? [],
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
      },
    });
  }

  async delete(userId: number, id: number): Promise<void> {
    const candidate = await this.requireCandidate(userId);
    // Scope the delete to this candidate so a user can never remove another
    // candidate's project by guessing an id.
    const { count } = await prisma.project.deleteMany({
      where: { id, candidateId: candidate.id },
    });
    if (count === 0) throw new NotFoundException('Project not found');
  }

  private async requireCandidate(userId: number) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate profile not found');
    return candidate;
  }
}
