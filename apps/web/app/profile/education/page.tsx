import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { AccountShell } from '../../../components/profile/AccountShell';
import { EducationManager } from '../../../components/profile/EducationManager';

export default async function EducationPage() {
  const session = (await readUserFromCookie())!;
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  const educations = candidate
    ? await prisma.education.findMany({
        where: { candidateId: candidate.id },
        orderBy: [{ endYear: 'desc' }, { startYear: 'desc' }],
      })
    : [];

  return (
    <AccountShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Education</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Add the colleges and degrees you want recruiters to see.
          </p>
        </header>
        <EducationManager initial={educations} />
      </div>
    </AccountShell>
  );
}
