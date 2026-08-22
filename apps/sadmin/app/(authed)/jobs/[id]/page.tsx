import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminApiGet } from '../../../../lib/admin-api';
import type { JobReviewDetail } from '../../../../lib/jobs/types';
import { JobDecisionForm } from '../../../../components/jobs/JobDecisionForm';
import { BackLink, JobDetailView } from '../../../../components/jobs/JobDetailView';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';

export const metadata: Metadata = {
  title: 'Job review — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const BACK_HREF = '/jobs';
const BACK_LABEL = 'Back to job review';

interface PageProps {
  params: Promise<{ id: string }>;
}

// The moderation screen. Its presentational half now lives in JobDetailView,
// shared with /sadmin/job-postings/[id] — the data path, the id coercion, the
// error branch and the approve/send-back form are unchanged, so this route
// behaves exactly as it did before the extraction.
export default async function JobReviewDetailPage({ params }: PageProps) {
  // Layer 2 scope gate for this route segment — see
  // lib/roles/scope-map.ts. The (authed) layout only proves the caller is
  // active staff; this proves they hold THIS module. Load-bearing because
  // the reads below hit Postgres directly and never reach AdminGuard.
  await requireAdminScope('moderation', 'READ_ONLY');

  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject non-numeric ids
  // before spending an API call on them.
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();

  const result = await adminApiGet<JobReviewDetail>(`/admin/jobs/${jobId}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div data-wide className="space-y-6">
        <BackLink href={BACK_HREF} label={BACK_LABEL} />
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-danger)]"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const job = result.data;

  return (
    <JobDetailView
      job={job}
      backHref={BACK_HREF}
      backLabel={BACK_LABEL}
      // One shared anchor for every relative time on the page, so two values
      // rendered either side of a millisecond boundary cannot disagree.
      now={new Date()}
      {...(job.status === 'PENDING_MODERATION'
        ? { decisionForm: <JobDecisionForm jobId={job.id} /> }
        : {})}
    />
  );
}
