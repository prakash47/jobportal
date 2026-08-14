import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '../../../../lib/auth/require-super-admin';
import { adminApiGet } from '../../../../lib/admin-api';
import type { JobReviewDetail } from '../../../../lib/jobs/types';
import {
  clampPage,
  firstParam,
  jobPostingDeleteBlockedReason,
  jobPostingsHref,
  normalizeQuery,
  parseStatusTab,
} from '../../../../lib/job-postings/format';
import { countJobApplications } from '../../../../lib/job-postings/queries';
import { BackLink, JobDetailView } from '../../../../components/jobs/JobDetailView';
import { DeleteJobPostingButton } from '../../../../components/job-postings/DeleteJobPostingButton';
import { isFlagEnabled } from '@jobportal/feature-flags';

export const metadata: Metadata = {
  title: 'Job posting — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  // Carried from the master list so Back returns to the exact filtered page the
  // admin left. Typed as Next actually delivers it — a repeated key arrives as
  // an array.
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

/**
 * The master-list detail view: everything about one posting, plus Delete.
 *
 * A separate route from /sadmin/jobs/[id] rather than a link to it, for two
 * reasons: SidebarNav's isActive matches a `${href}/` prefix, so linking View at
 * /jobs/123 would visibly jump the rail highlight onto "Job review"; and that
 * screen is framed as a moderation decision, which is not what this console is
 * for. The presentation itself is shared via JobDetailView, so the two cannot
 * drift into describing the same job differently.
 */
export default async function JobPostingDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. A layout is a
  // real boundary, but stating the requirement in the route makes it impossible
  // to move this file out from under that layout and silently lose the check —
  // the same call /candidates/[id] makes.
  await requireSuperAdmin();

  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject non-numeric ids
  // before spending an API call on them.
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();

  const sp = await searchParams;
  const status = parseStatusTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));
  const backHref = jobPostingsHref(status, page, q);

  const [result, applicationCount, deleteKilled] = await Promise.all([
    // The SAME endpoint the moderation screen reads. Re-implementing the query
    // here would fork logic (the resolved skill/city names, the company's KYC
    // status) that must agree with what the decision endpoint enforces.
    adminApiGet<JobReviewDetail>(`/admin/jobs/${jobId}`),
    // Not on the shared endpoint's payload — that endpoint serves the moderation
    // console, where the count is irrelevant. Read here rather than widening it
    // for one caller.
    countJobApplications(jobId),
    isFlagEnabled('killswitch.admin_job_delete'),
  ]);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div data-wide className="space-y-6">
        <BackLink href={backHref} label="Back to job postings" />
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
      backHref={backHref}
      backLabel="Back to job postings"
      // One shared anchor for every relative time on the page.
      now={new Date()}
      // No decisionForm: approving or sending a job back belongs to the review
      // console, which owns that workflow and its ordering rules. Offering the
      // decision from two places would let one be used without the other's
      // queue ever reflecting it.
      actions={
        <DeleteJobPostingButton
          jobId={job.id}
          title={job.title}
          blockedReason={jobPostingDeleteBlockedReason({ applicationCount })}
          killed={deleteKilled}
          // The row is gone after a successful delete, so refreshing this route
          // in place would render a 404. Go back to the list the admin came
          // from instead.
          onDeleted={backHref}
        />
      }
    />
  );
}
