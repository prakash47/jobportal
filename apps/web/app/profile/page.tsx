import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { ProfileForm } from '../../components/profile/ProfileForm';
import { CompletenessIndicator } from '../../components/profile/CompletenessIndicator';

// Lazily ensures the Candidate row exists, then loads the profile fields the
// form needs. Mirrors apps/api ProfileService.getProfile but the dashboard
// reads via Prisma directly so the SSR pass is a single round-trip.
async function loadProfile(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, emailVerified: true },
  });
  let candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) {
    candidate = await prisma.candidate.create({ data: { userId } });
  }
  return { user, candidate };
}

export default async function ProfileOverviewPage() {
  // Layout's requireUser already redirects anonymous users; we're guaranteed
  // a session here. The non-null assertion narrows the type for the page.
  const session = (await readUserFromCookie())!;
  const { user, candidate } = await loadProfile(session.sub);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Your profile
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Recruiters see this when you apply. Keep it current.
          </p>
        </div>
        <CompletenessIndicator score={candidate.profileCompleteness} />
      </header>

      <ProfileForm
        initial={{
          name: user.name,
          phone: user.phone,
          headline: candidate.headline,
          summary: candidate.summary,
          experienceMonths: candidate.experienceMonths,
          currentTitle: candidate.currentTitle,
          currentSalaryPaise: candidate.currentSalaryPaise,
          expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
          expectedSalaryMaxPaise: candidate.expectedSalaryMaxPaise,
          noticePeriodDays: candidate.noticePeriodDays,
        }}
      />
    </div>
  );
}
