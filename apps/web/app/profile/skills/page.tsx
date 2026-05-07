import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { SkillsManager } from '../../../components/profile/SkillsManager';

export default async function SkillsPage() {
  const session = (await readUserFromCookie())!;
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    select: { skillIds: true },
  });
  const skillIds = candidate?.skillIds ?? [];
  const allSkills = await prisma.skill.findMany({
    select: { id: true, slug: true, name: true, category: true },
    orderBy: { name: 'asc' },
    take: 500,
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Skills</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Pick the skills recruiters can find you with. Three or more makes a noticeable difference.
        </p>
      </header>
      <SkillsManager initialSelected={skillIds} catalogue={allSkills} />
    </div>
  );
}
