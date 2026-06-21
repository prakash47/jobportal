import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
import type { SkillsUpdateInput } from './dto';
import { recomputeCompleteness } from './profile.service';

const MAX_SKILLS = 50;

// Normalise a free-text skill name into a catalogue slug. Maps "React.js" →
// "react-js", "  Node  " → "node". Returns '' if nothing usable remains.
// Exported for unit testing.
export function slugifySkill(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class ProfileSkillsService {
  async update(userId: number, input: SkillsUpdateInput): Promise<{ skillIds: number[] }> {
    const ids = input.skillIds ?? [];
    const customs = input.customSkills ?? [];

    // Validate that all referenced catalogue skills exist; reject the whole
    // update otherwise (no partial application).
    if (ids.length > 0) {
      const found = await prisma.skill.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== new Set(ids).size) {
        throw new NotFoundException('One or more skill IDs do not exist');
      }
    }

    const before = await prisma.candidate.findUnique({
      where: { userId },
      select: { skillIds: true },
    });
    if (!before) throw new NotFoundException('Candidate profile not found');

    // Normalise custom names to unique slugs (first name wins per slug).
    const slugToName = new Map<string, string>();
    for (const raw of customs) {
      const slug = slugifySkill(raw);
      if (slug && !slugToName.has(slug)) slugToName.set(slug, raw.trim());
    }
    const customSlugs = [...slugToName.keys()];

    // Which custom slugs already exist in the catalogue (no write needed)?
    const existing =
      customSlugs.length > 0
        ? await prisma.skill.findMany({
            where: { slug: { in: customSlugs } },
            select: { id: true, slug: true },
          })
        : [];
    const existingSlugs = new Set(existing.map((s) => s.slug));
    const newSlugs = customSlugs.filter((s) => !existingSlugs.has(s));

    // Enforce the cap BEFORE creating any catalogue rows, so a rejected request
    // never leaves orphaned isCustom Skill rows behind. (prospectiveCount is an
    // upper bound: existing-custom ids may overlap `ids`, so the post-merge size
    // can only be ≤ this.)
    const prospectiveCount = new Set([...ids, ...existing.map((s) => s.id)]).size + newSlugs.length;
    if (prospectiveCount > MAX_SKILLS) {
      throw new BadRequestException(`You can add at most ${MAX_SKILLS} skills.`);
    }

    // Create the genuinely-new custom skills. createMany + skipDuplicates is
    // race-safe — two concurrent requests with the same new slug won't collide
    // on the @unique(slug) constraint (the duplicate is skipped, not a P2002).
    if (newSlugs.length > 0) {
      await prisma.skill.createMany({
        data: newSlugs.map((slug) => ({ slug, name: slugToName.get(slug) ?? slug, isCustom: true })),
        skipDuplicates: true,
      });
    }

    // Resolve every custom slug (pre-existing + just-created) back to ids.
    const customRows =
      customSlugs.length > 0
        ? await prisma.skill.findMany({ where: { slug: { in: customSlugs } }, select: { id: true } })
        : [];

    const merged = [...new Set([...ids, ...customRows.map((s) => s.id)])].sort((a, b) => a - b);
    // Defensive recheck after merge (a concurrent insert could nudge the count).
    if (merged.length > MAX_SKILLS) {
      throw new BadRequestException(`You can add at most ${MAX_SKILLS} skills.`);
    }

    await prisma.candidate.update({
      where: { userId },
      data: { skillIds: merged },
    });

    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'SKILLS_UPDATE',
        diff: {
          before: before.skillIds,
          after: merged,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await recomputeCompleteness(userId);
    return { skillIds: merged };
  }
}
