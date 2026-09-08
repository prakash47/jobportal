import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { ExperienceManager } from '../../../components/profile/ExperienceManager';

export default async function ExperiencePage() {
  const session = await requireUser();
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
    isCareerBreak: r.isCareerBreak,
    description: r.description,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      {/*
        Was "List your roles in reverse-chronological order" — an instruction to
        do by hand what the query has always done (orderBy isCurrent, startDate
        desc). Reported as confusing, and it was: it asked for work the user
        cannot actually do, since there is no manual ordering control.
      */}
      <PageHeader
        title="Work experience"
        description="Add your roles in any order — we arrange them by date automatically."
      />
      <ContentCard className="p-5 sm:p-6">
        <ExperienceManager initial={experiences} />
      </ContentCard>
    </div>
  );
}
