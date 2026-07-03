import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { ExperienceManager } from '../../../components/profile/ExperienceManager';

export default async function ExperiencePage() {
  const session = (await readUserFromCookie())!;
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  const rows = candidate
    ? await prisma.workExperience.findMany({
        where: { candidateId: candidate.id },
        orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
      })
    : [];

  // Serialise dates so the client component receives plain strings.
  const experiences = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    title: r.title,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate ? r.endDate.toISOString() : null,
    isCurrent: r.isCurrent,
    description: r.description,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Work experience"
        description="List your roles in reverse-chronological order."
      />
      <ContentCard className="p-5 sm:p-6">
        <ExperienceManager initial={experiences} />
      </ContentCard>
    </div>
  );
}
