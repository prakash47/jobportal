import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Work experience
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          List your roles in reverse-chronological order.
        </p>
      </header>
      <ExperienceManager initial={experiences} />
    </div>
  );
}
