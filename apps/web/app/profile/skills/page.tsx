import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { SkillsManager } from '../../../components/profile/SkillsManager';

export default async function SkillsPage() {
  const session = await requireUser();
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    select: { skillIds: true },
  });
  const skillIds = candidate?.skillIds ?? [];
  // No `take` cap any more. The list is searched and grouped rather than dumped
  // on the page, so a skill outside the first 500 alphabetically used to be
  // literally unreachable from this screen.
  const allSkills = await prisma.skill.findMany({
    select: { id: true, slug: true, name: true, category: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Skills"
        description="Search for the skills recruiters can find you with, or type your own. Three or more makes a noticeable difference."
      />
      <ContentCard className="p-5 sm:p-6">
        <SkillsManager initialSelected={skillIds} catalogue={allSkills} />
      </ContentCard>
    </div>
  );
}
