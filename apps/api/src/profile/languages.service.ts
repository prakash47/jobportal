import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@jobportal/db';
import type { LanguageCreateInput } from './dto';

@Injectable()
export class LanguagesService {
  async list(userId: number) {
    const candidate = await this.requireCandidate(userId);
    return prisma.candidateLanguage.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: number, input: LanguageCreateInput) {
    const candidate = await this.requireCandidate(userId);
    try {
      return await prisma.candidateLanguage.create({
        data: {
          candidateId: candidate.id,
          name: input.name,
          proficiency: input.proficiency,
        },
      });
    } catch (e) {
      // Unique (candidateId, name) violation — the language is already listed.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That language is already added.');
      }
      throw e;
    }
  }

  async delete(userId: number, id: number): Promise<void> {
    const candidate = await this.requireCandidate(userId);
    const { count } = await prisma.candidateLanguage.deleteMany({
      where: { id, candidateId: candidate.id },
    });
    if (count === 0) throw new NotFoundException('Language not found');
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
