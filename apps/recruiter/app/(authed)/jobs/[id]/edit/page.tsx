import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../../../lib/auth/server-session';
import { loadJobFormCatalogues } from '../../../../../lib/jobs/catalogues';
import { jobToWizardInitialValues } from '../../../../../lib/jobs/wizard-values';
import { PostJobWizard } from '../../../../../components/jobs/PostJobWizard';
import { JobStatusBadge } from '../../../../../components/jobs/JobStatusBadge';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Edit an existing posting (Jobs list → ⋮ menu → Edit). Reuses the Post-a-Job
// form in edit mode against the API's PATCH /recruiter/jobs/:id. Owner-scoped:
// a teammate's (or unknown) id 404s, matching the API ownership pattern.
// Deliberately NOT gated by killswitch.recruiter_post_job — only the posting
// action is killswitched; job management stays up (same rule as the API).
export default async function EditJobPage({ params }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  // Integer within Postgres int4 — a float ('1.5') or an over-range id would
  // throw inside Prisma (500) instead of the 404 an unknown id deserves.
  if (!Number.isInteger(jobId) || jobId < 1 || jobId > 2147483647) notFound();

  const session = (await readUserFromCookie())!;

  // Owner-OR-collaborator (SRS §4.9 Collaborate → "manage this job"). findFirst
  // with the access OR so a collaborator can open the edit wizard; mutations are
  // re-checked at the API (PATCH /recruiter/jobs/:id → getOne, also broadened).
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      OR: [{ postedById: session.sub }, { collaborators: { some: { userId: session.sub } } }],
    },
  });
  if (!job) notFound();

  const { skills, cities, localities, industries, functionalAreas } =
    await loadJobFormCatalogues();

  const company = await prisma.company.findUnique({
    where: { id: job.companyId },
    select: { name: true },
  });

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Edit job
          </h1>
          <JobStatusBadge status={job.status} />
        </div>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          <span className="font-medium text-[var(--color-fg)]">{job.title}</span>
          {' · '}Job ID {job.id}. Changes to a live job go public immediately.
        </p>
      </header>

      <PostJobWizard
        mode="edit"
        jobId={job.id}
        companyName={company?.name ?? '—'}
        skills={skills}
        cities={cities}
        localities={localities}
        industries={industries}
        functionalAreas={functionalAreas}
        quota={null}
        jobType={job.jobType}
        initialValues={jobToWizardInitialValues(job)}
      />
    </div>
  );
}
