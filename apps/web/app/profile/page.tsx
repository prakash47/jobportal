import { prisma } from '@jobportal/db';
import { Bell, Bookmark, ClipboardList, Eye } from '@jobportal/ui/icons';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { NextSteps, StatCard } from '../../components/profile';
import { completenessBreakdown } from '@jobportal/domain/profile-completeness';
import { withEditLinks } from '../../lib/profile/completeness-links';
// Deep import (not via the barrel): RecommendedJobs is server-only (ES client +
// Prisma), so it must not be reachable through the client-mixed barrel.
import { RecommendedJobs } from '../../components/profile/RecommendedJobs';

// Loads everything the dashboard home renders in one SSR pass: the candidate row
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
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } }),
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
    phone: user.phone,
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

  // The checklist is DERIVED from the same weighting table the percentage is
  // summed from, so the two cannot contradict each other. It used to be a
  // hand-written list of five items against a fourteen-field scorer, which is
  // how the card came to say "All sections filled in" at 94%.
  // NOTE this deliberately does NOT read Candidate.profileCompleteness. That
  // column is only written on certain API writes (profile PATCH, and the
  // education/experience services call recomputeCompleteness) and never on read,
  // so a row seeded or migrated into place stays wrong until the user edits
  // something — a seeded demo candidate showed 75 there while the fields
  // actually summed to 61. Rendering that stored number beside a freshly-derived
  // checklist is how the original contradiction happened; deriving both from one
  // call is the fix.
  const steps = withEditLinks(
    completenessBreakdown({
      name: data.name,
      phone: data.phone,
      headline: data.candidate.headline,
      summary: data.candidate.summary,
      experienceMonths: data.candidate.experienceMonths,
      currentTitle: data.candidate.currentTitle,
      currentCompanyId: data.candidate.currentCompanyId,
      currentCompanyName: data.candidate.currentCompanyName,
      expectedSalaryMinPaise: data.candidate.expectedSalaryMinPaise,
      noticePeriodDays: data.candidate.noticePeriodDays,
      preferredCityIds: data.candidate.preferredCityIds,
      skillIds: data.candidate.skillIds,
      educationCount: data.eduCount,
      experienceCount: data.expCount,
      hasActiveResume: data.candidate.activeResumeId !== null,
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        description="Here's what's happening with your job search."
      />

      <NextSteps steps={steps} />

      <section aria-label="Your activity">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            href="/applications"
            label="Applications"
            count={data.applicationsCount}
            chipClassName="bg-[var(--color-accent-50)] text-[var(--color-accent-600)]"
            icon={<ClipboardList className="size-5" />}
          />
          <StatCard
            href="/saved-jobs"
            label="Saved jobs"
            count={data.savedCount}
            chipClassName="bg-[var(--color-primary-50)] text-[var(--color-primary-600)]"
            icon={<Bookmark className="size-5" />}
          />
          <StatCard
            href="/alerts"
            label="Job alerts"
            count={data.alertsCount}
            icon={<Bell className="size-5" />}
          />
          <StatCard
            label="Profile views"
            count={data.candidate.profileViews}
            icon={<Eye className="size-5" />}
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
