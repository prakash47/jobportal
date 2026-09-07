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
          // Omitted keys fall through to the column default (true) rather than
          // being written as false — the onboarding wizard still posts only
          // name + proficiency, and its rows mean "I know this language".
          ...(input.canRead !== undefined ? { canRead: input.canRead } : {}),
          ...(input.canWrite !== undefined ? { canWrite: input.canWrite } : {}),
          ...(input.canSpeak !== undefined ? { canSpeak: input.canSpeak } : {}),
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
