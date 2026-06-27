import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { Bell, Bookmark, Briefcase } from '@jobportal/ui/icons';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { NextSteps, StatCard, type ProfileStep } from '../../components/profile';
// Deep import (not via the barrel): RecommendedJobs is server-only (ES client +
// Prisma), so it must not be reachable through the client-mixed barrel.
import { RecommendedJobs } from '../../components/profile/RecommendedJobs';

// Loads everything the dashboard hub renders in one SSR pass: the candidate row
// (creating it lazily for brand-new accounts), the activity counts, the
// already-applied job ids (to exclude from recommendations), and the skill/city
// slugs the recommendation query needs.
async function loadDashboard(userId: number) {
  const candidate =
    (await prisma.candidate.findUnique({ where: { userId } })) ??
    (await prisma.candidate
      .create({ data: { userId } })
      .catch(() => prisma.candidate.findUniqueOrThrow({ where: { userId } })));

  const [user, savedCount, alertsCount, appliedRows, eduCount, expCount, skillRows, cityRows] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      prisma.savedJob.count({ where: { userId } }),
      prisma.jobAlert.count({ where: { userId } }),
      prisma.application.findMany({ where: { userId }, select: { jobId: true } }),
      prisma.education.count({ where: { candidateId: candidate.id } }),
      prisma.workExperience.count({ where: { candidateId: candidate.id } }),
      candidate.skillIds.length > 0
        ? prisma.skill.findMany({ where: { id: { in: candidate.skillIds } }, select: { slug: true } })
        : Promise.resolve([]),
      candidate.preferredCityIds.length > 0
        ? prisma.city.findMany({
            where: { id: { in: candidate.preferredCityIds } },
            select: { slug: true },
          })
        : Promise.resolve([]),
    ]);

  return {
    candidate,
    name: user.name,
    savedCount,
    alertsCount,
    applicationsCount: appliedRows.length,
    excludeJobIds: appliedRows.map((r) => r.jobId),
    eduCount,
    expCount,
    skillSlugs: skillRows.map((s) => s.slug),
    citySlugs: cityRows.map((c) => c.slug),
  };
}

export default async function DashboardPage() {
  // The layout's requireUser already redirects anonymous users; the non-null
  // assertion narrows the type for the page.
  const session = (await readUserFromCookie())!;
  const data = await loadDashboard(session.sub);

  const firstName = (data.name ?? '').trim().split(/\s+/)[0] || null;

  const steps: ProfileStep[] = [
    {
      label: 'Add a professional headline',
      href: '/profile/details',
      done: Boolean(data.candidate.headline?.trim()),
    },
    { label: 'Add your skills', href: '/profile/skills', done: data.candidate.skillIds.length > 0 },
    {
      label: 'Upload your resume',
      href: '/profile/resume',
      done: data.candidate.activeResumeId !== null,
    },
    { label: 'Add your education', href: '/profile/education', done: data.eduCount > 0 },
    { label: 'Add work experience', href: '/profile/experience', done: data.expCount > 0 },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Hi {firstName ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Here&apos;s what&apos;s happening with your job search.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/profile/details">Edit profile</Link>
        </Button>
      </header>

      <NextSteps score={data.candidate.profileCompleteness} steps={steps} />

      <section aria-label="Your activity">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            href="/applications"
            label="Applications"
            count={data.applicationsCount}
            icon={<Briefcase className="size-5" />}
          />
          <StatCard
            href="/saved-jobs"
            label="Saved jobs"
            count={data.savedCount}
            icon={<Bookmark className="size-5" />}
          />
          <StatCard
            href="/alerts"
            label="Job alerts"
            count={data.alertsCount}
            icon={<Bell className="size-5" />}
          />
        </div>
      </section>

      <RecommendedJobs
        skillSlugs={data.skillSlugs}
        citySlugs={data.citySlugs}
        excludeJobIds={data.excludeJobIds}
      />
    </div>
  );
}
