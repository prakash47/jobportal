import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../../../lib/auth/server-session';
import { ApplicantsTable, type ApplicantRow } from '../../../../../components/jobs/ApplicantsTable';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicantsPage({ params }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) notFound();

  const session = (await readUserFromCookie())!;

  // Owner-scoped lookup. Cross-recruiter access produces 404 (no leak),
  // matching the API ownership pattern.
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, postedById: true, status: true },
  });
  if (!job || job.postedById !== session.sub) notFound();

  const applicants = await prisma.application.findMany({
    where: { jobId },
    orderBy: { appliedAt: 'desc' },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      recruiterNotes: true,
      user: {
        select: {
          name: true,
          email: true,
          candidate: {
            select: {
              headline: true,
              experienceMonths: true,
              currentTitle: true,
              expectedSalaryMinPaise: true,
              expectedSalaryMaxPaise: true,
              activeResumeId: true,
            },
          },
        },
      },
    },
  });

  // Serialise the dates so the client component receives plain strings.
  const rows: ApplicantRow[] = applicants.map((a) => ({
    id: a.id,
    status: a.status,
    appliedAt: a.appliedAt.toISOString(),
    recruiterNotes: a.recruiterNotes,
    user: a.user,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs">
          <Link
            href="/jobs"
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            ← All jobs
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {job.title}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {applicants.length} {applicants.length === 1 ? 'applicant' : 'applicants'}
        </p>
      </header>

      <ApplicantsTable rows={rows} />
    </div>
  );
}
