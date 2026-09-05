import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { ProfileForm } from '../../../components/profile/ProfileForm';
import { ProfilePhotoCard } from '../../../components/profile/ProfilePhotoCard';
import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

// Lazily ensures the Candidate row exists, then loads the profile fields the
// form needs. Mirrors apps/api ProfileService.getProfile but reads via Prisma
// directly so the SSR pass is a single round-trip.
async function loadProfile(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, emailVerified: true, image: true },
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
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Personal details"
        description="Recruiters see this when you apply. Keep it current."
      />

      {/*
        The stored URL is re-derived against the bases configured right now.
        `getPublicUrl` writes an ABSOLUTE origin into the row, so a photo
        uploaded while R2_PUBLIC_URL was blank keeps a localhost origin forever
        unless it is resolved on read — the same trap bugfix/asset-url-origin
        fixed for company logos. A Google avatar URL passes through untouched.
      */}
      <ProfilePhotoCard
        name={user.name ?? user.email}
        initialImageUrl={resolveStoredAssetUrl(user.image, {
          publicBase: process.env.R2_PUBLIC_URL ?? '',
          apiBase: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
        })}
      />

      <ContentCard className="p-5 sm:p-6">
        <ProfileForm
          initial={{
            name: user.name,
            phone: user.phone,
            headline: candidate.headline,
            summary: candidate.summary,
            workStatus: candidate.workStatus,
            experienceMonths: candidate.experienceMonths,
            currentTitle: candidate.currentTitle,
            currentSalaryPaise: candidate.currentSalaryPaise,
            expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
            expectedSalaryMaxPaise: candidate.expectedSalaryMaxPaise,
            noticePeriodDays: candidate.noticePeriodDays,
          }}
        />
      </ContentCard>
    </div>
  );
}
