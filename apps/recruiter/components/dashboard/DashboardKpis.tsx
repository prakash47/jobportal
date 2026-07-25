import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { Briefcase, ClipboardList, FileText, TrendingUp, UserPlus, Users } from '@jobportal/ui/icons';
import { getCompanyKpis } from '../../lib/dashboard/queries';
import { KpiTile } from './KpiTile';
import { AttentionList } from './AttentionList';
import { HiringFunnel } from './HiringFunnel';
import { JobStatusBreakdown } from './JobStatusBreakdown';
import { TopJobs } from './TopJobs';

// The whole KPI half of the dashboard. This is an async server component so the
// page can put it behind <Suspense> and flush the verification card — which the
// owner wants first and which needs only ONE query — without waiting on the six
// aggregate queries this fires.
//
// Everything below is company-scoped and computed from real rows. Metrics that
// would need data the schema does not hold are deliberately absent rather than
// faked: there is no view/impression table anywhere, so no "views" or
// "view-to-apply" tile; Application.statusHistory is unpopulated on historical
// rows, so no time-to-hire; and no SavedJob rows exist, so no "candidate
// interest" tile.
export async function DashboardKpis({ companyId, userId }: { companyId: number; userId: number }) {
  const kpis = await getCompanyKpis(companyId, userId);

  // A company with nothing posted gets the original call-to-action rather than a
  // wall of zeroes, which would read as a broken page on day one.
  if (kpis.totalJobs === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">No jobs posted yet</p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Post your first opening and start receiving applicants.
        </p>
        <Button asChild variant="primary" className="mt-4">
          <Link href="/post-job">Post a job</Link>
        </Button>
      </div>
    );
  }

  const { jobsByStatus, appsByStatus } = kpis;

  return (
    <div className="space-y-6">
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile
            label="Jobs posted"
            value={kpis.totalJobs}
            hint={kpis.postedByYou > 0 ? `${kpis.postedByYou} posted by you` : undefined}
            icon={Briefcase}
            href="/jobs"
            ariaAction="View all jobs"
          />
          {/* "Open", not "Active" — that is the label JOB_STATUS_META gives
              ACTIVE everywhere else on this page and across the Jobs list. */}
          <KpiTile
            label="Open jobs"
            value={jobsByStatus.ACTIVE}
            hint={kpis.expiringSoon > 0 ? `${kpis.expiringSoon} expiring soon` : 'Live for candidates'}
            icon={TrendingUp}
            href="/jobs?status=ACTIVE"
            ariaAction="View open jobs"
          />
          <KpiTile
            label="Draft jobs"
            value={jobsByStatus.DRAFT}
            hint="Saved but not published"
            icon={FileText}
            href="/jobs?status=DRAFT"
            ariaAction="View drafts"
          />
          {/* Applications, not applicants: one candidate applying to three of
              your jobs is three rows here. Naming it "applicants" would claim a
              distinct-people count this query does not compute. */}
          <KpiTile
            label="Applications received"
            value={kpis.totalApplications}
            hint={`${kpis.inPipeline.toLocaleString('en-IN')} still in the pipeline`}
            icon={Users}
            href="/jobs"
            ariaAction="View jobs"
          />
          {/* APPLIED means "no status transition yet". Nothing records whether
              a recruiter has opened the application, so the hint describes the
              stage rather than claiming an unread state. */}
          <KpiTile
            label="Needs review"
            value={appsByStatus.APPLIED}
            hint="Awaiting a first decision"
            icon={ClipboardList}
            href="/jobs"
            ariaAction="View jobs"
          />
          <KpiTile
            label="Candidates hired"
            value={appsByStatus.HIRED}
            hint={
              appsByStatus.OFFERED > 0
                ? `${appsByStatus.OFFERED} offer${appsByStatus.OFFERED === 1 ? '' : 's'} outstanding`
                : 'Marked hired by your team'
            }
            icon={UserPlus}
          />
        </div>
      </section>

      <AttentionList
        newApplications={appsByStatus.APPLIED}
        expiringSoon={kpis.expiringSoon}
        activeWithNoApplicants={kpis.activeWithNoApplicants}
        drafts={jobsByStatus.DRAFT}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HiringFunnel appsByStatus={appsByStatus} />
        <JobStatusBreakdown jobsByStatus={jobsByStatus} totalJobs={kpis.totalJobs} />
      </div>

      <TopJobs jobs={kpis.topJobs} />
    </div>
  );
}
