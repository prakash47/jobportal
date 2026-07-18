import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { readUserFromCookie } from '../../../../lib/auth/server-session';
import { buildPublicJobUrl } from '../../../../lib/jobs/public-url';
import { formatJobLocation } from '../../../../components/jobs/job-list-format';
import { JobDetailHeader } from '../../../../components/jobs/detail/JobDetailHeader';
import { JobDescriptionSection } from '../../../../components/jobs/detail/JobDescriptionSection';
import { CandidateRequirementsCard } from '../../../../components/jobs/detail/CandidateRequirementsCard';
import { SalaryCompensationCard } from '../../../../components/jobs/detail/SalaryCompensationCard';
import { ApplicationStatsPanel } from '../../../../components/jobs/detail/ApplicationStatsPanel';
import { JobValidityCard } from '../../../../components/jobs/detail/JobValidityCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Recruiter Job Detail (SRS §4.9). Opened from the Jobs-list title link; shows
// the full posting a recruiter set (overview, description, candidate
// requirements, salary), a live application-stats snapshot, and validity/expiry
// with an Extend/Upgrade CTA. Owner-scoped: a teammate's (or unknown) id 404s,
// matching the sibling applicants/edit pages and the API ownership pattern.
// Reads Postgres directly in the RSC (reads/writes split) — no API endpoint.
export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  // Integer within Postgres int4 — a float ('1.5') or over-range id would throw
  // inside Prisma (500) instead of the 404 an unknown id deserves.
  if (!Number.isInteger(jobId) || jobId < 1 || jobId > 2147483647) notFound();

  const session = (await readUserFromCookie())!;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      description: true,
      canonicalSlug: true,
      status: true,
      postedAt: true,
      expiresAt: true,
      workMode: true,
      employmentType: true,
      openings: true,
      qualifications: true,
      internshipDurationMonths: true,
      salaryMinPaise: true,
      salaryMaxPaise: true,
      experienceMinYears: true,
      experienceMaxYears: true,
      skillIds: true,
      postedById: true,
      companyId: true,
      company: { select: { id: true, name: true, logoUrl: true } },
      primaryCity: { select: { name: true } },
      locality: { select: { name: true } },
      functionalArea: { select: { name: true } },
    },
  });
  if (!job || job.postedById !== session.sub) notFound();

  // Everything below only depends on the loaded job — run in parallel.
  const [skillRows, statusCounts, matched, billingEnabled] = await Promise.all([
    job.skillIds.length > 0
      ? prisma.skill.findMany({
          where: { id: { in: job.skillIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.application.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    }),
    // Matches — applicants whose candidate skills overlap the job's required
    // skills (mirrors the Jobs-list "Matches" column). Skipped (0) when the job
    // declares no required skills.
    job.skillIds.length > 0
      ? prisma.application.count({
          where: { jobId, user: { candidate: { skillIds: { hasSome: job.skillIds } } } },
        })
      : Promise.resolve(0),
    isFlagEnabled(FLAG.SUBSCRIPTION_SYSTEM),
  ]);

  // Resolve skill names in the recruiter's declared order.
  const skillNameById = new Map(skillRows.map((s) => [s.id, s.name]));
  const skillNames = job.skillIds
    .map((sid) => skillNameById.get(sid))
    .filter((n): n is string => Boolean(n));

  // Fold the per-status buckets into the panel's five metrics.
  let total = 0;
  let newCount = 0;
  let shortlisted = 0;
  let rejected = 0;
  for (const c of statusCounts) {
    const n = c._count._all;
    total += n;
    if (c.status === 'APPLIED') newCount += n;
    else if (c.status === 'SHORTLISTED') shortlisted += n;
    else if (c.status === 'REJECTED') rejected += n;
  }

  const location = formatJobLocation({
    workMode: job.workMode,
    cityName: job.primaryCity?.name ?? null,
    localityName: job.locality?.name ?? null,
  });

  return (
    // data-wide → the authed layout widens to max-w-6xl for the two-column
    // detail + sidebar layout (see (authed)/layout.tsx).
    <div data-wide className="space-y-6">
      <div className="text-xs">
        <Link href="/jobs" className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          ← All jobs
        </Link>
      </div>

      <JobDetailHeader
        jobId={job.id}
        title={job.title}
        companyId={job.company.id}
        companyName={job.company.name}
        logoUrl={job.company.logoUrl}
        status={job.status}
        location={location}
        employmentType={job.employmentType}
        openings={job.openings}
        postedAt={job.postedAt}
        publicUrl={buildPublicJobUrl(job.canonicalSlug)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <JobDescriptionSection description={job.description} />
          <CandidateRequirementsCard
            experienceMinYears={job.experienceMinYears}
            experienceMaxYears={job.experienceMaxYears}
            employmentType={job.employmentType}
            departmentName={job.functionalArea?.name ?? null}
            qualifications={job.qualifications}
            internshipDurationMonths={job.internshipDurationMonths}
            skillNames={skillNames}
          />
        </div>

        {/* top-20 (5rem) clears the layout's sticky h-14 (3.5rem) page header
            plus a gap, so the sidebar doesn't tuck under it while scrolling. */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <SalaryCompensationCard
            salaryMinPaise={job.salaryMinPaise}
            salaryMaxPaise={job.salaryMaxPaise}
          />
          <ApplicationStatsPanel
            jobId={job.id}
            total={total}
            newCount={newCount}
            shortlisted={shortlisted}
            rejected={rejected}
            matched={matched}
          />
          <JobValidityCard
            jobId={job.id}
            status={job.status}
            postedAt={job.postedAt}
            expiresAt={job.expiresAt}
            billingEnabled={billingEnabled}
          />
        </aside>
      </div>
    </div>
  );
}
