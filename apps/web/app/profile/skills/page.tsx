import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
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
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Skills"
        description="Pick the skills recruiters can find you with. Three or more makes a noticeable difference."
      />
      <ContentCard className="p-5 sm:p-6">
        <SkillsManager initialSelected={skillIds} catalogue={allSkills} />
      </ContentCard>
    </div>
  );
}
