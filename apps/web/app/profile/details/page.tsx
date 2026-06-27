import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { AccountShell } from '../../../components/profile/AccountShell';
import { ProfileForm } from '../../../components/profile/ProfileForm';

// Lazily ensures the Candidate row exists, then loads the profile fields the
// form needs. Mirrors apps/api ProfileService.getProfile but reads via Prisma
// directly so the SSR pass is a single round-trip.
async function loadProfile(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, emailVerified: true },
  });
  // Race-safe lazy create: a brand-new account has only the User row, and two
  // concurrent /profile requests could otherwise both try to insert the
  // Candidate (Candidate.userId is unique → the loser would 500 with P2002).
  // Matches loadDashboard in ../page.tsx.
  const candidate =
    (await prisma.candidate.findUnique({ where: { userId } })) ??
    (await prisma.candidate
      .create({ data: { userId } })
      .catch(() => prisma.candidate.findUniqueOrThrow({ where: { userId } })));
  return { user, candidate };
}

export default async function ProfileDetailsPage() {
  // The layout's requireUser already redirects anonymous users; we're
  // guaranteed a session here. The non-null assertion narrows the type.
  const session = (await readUserFromCookie())!;
  const { user, candidate } = await loadProfile(session.sub);

  return (
    <AccountShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Personal details
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Recruiters see this when you apply. Keep it current.
          </p>
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
    </AccountShell>
  );
}
