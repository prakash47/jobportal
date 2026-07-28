import { Suspense } from 'react';
import type { Metadata } from 'next';
// Building2 / Users / Briefcase read as employer side · candidate side · the
// listings themselves. All are already exported by the shared icons barrel, so
// packages/ui stays byte-untouched (the barrel is an explicit allowlist —
// `import * from 'lucide-react'` is banned — and appending to it, while
// lock-free, is a shared-surface edit worth not making for one glyph).
import { Briefcase, Building2, Users } from '@jobportal/ui/icons';
import {
  getActivityTrends,
  getPendingApprovals,
  getPlatformKpis,
  getSignupStats,
} from '../../../lib/dashboard/queries';
import { KpiCard } from '../../../components/dashboard/KpiCard';
import { PendingApprovals } from '../../../components/dashboard/PendingApprovals';
import { SignupStats } from '../../../components/dashboard/SignupStats';
import { ActivityTrends } from '../../../components/dashboard/ActivityTrends';

export const metadata: Metadata = {
  title: 'Dashboard — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// The page is split into two waves by cost, the same shape the recruiter
// dashboard uses:
//
//   Wave 1 (awaited): the three headline counts + pending approvals. All
//     indexed COUNTs, and approvals is the thing an admin opening this page
//     most needs to see, so it must not queue behind anything slower.
//   Wave 2 (<Suspense>): the three 30-day windowed queries behind the charts.
//     They scan a month of rows, so they stream in rather than holding up the
//     whole page.
//
// Only metrics with real backing data appear. Anything the schema cannot answer
// honestly (job views/impressions — no view or event table exists anywhere;
// time-to-hire — Application.statusHistory is unpopulated on historical rows)
// is omitted rather than faked, per the precedent the recruiter dashboard set.
export default async function DashboardPage() {
  const [kpis, approvals] = await Promise.all([getPlatformKpis(), getPendingApprovals()]);

  return (
    // data-wide opts into the (authed) layout's max-w-6xl column. A three-across
    // metric grid does not fit the default max-w-3xl reading column — without
    // this the cards render ~27% narrower than the identical tiles on the
    // recruiter dashboard, which sets data-wide for exactly this reason.
    <div data-wide className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Platform totals across Career Queue.
        </p>
      </div>

      <section aria-labelledby="sadmin-kpi-heading">
        <h2 id="sadmin-kpi-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Recruiters"
            value={kpis.recruiters}
            // Names the exclusion, because the number would otherwise be
            // indistinguishable from a raw user count and quietly disagree
            // with it once anyone is removed from a team.
            hint="Active recruiter accounts"
            icon={Building2}
          />
          <KpiCard
            label="Job seekers"
            value={kpis.seekers}
            hint="Registered candidate accounts"
            icon={Users}
          />
          {/* "Open", not "Active" — that is the label JOB_STATUS_META gives
              JobStatus.ACTIVE everywhere in the recruiter portal. */}
          <KpiCard
            label="Open jobs"
            value={kpis.openJobs}
            hint="Live and visible to candidates"
            icon={Briefcase}
          />
        </div>
      </section>

      <PendingApprovals data={approvals} />

      <Suspense fallback={<TrendsFallback />}>
        <DashboardTrends />
      </Suspense>
    </div>
  );
}

// Wave 2. Its own async component so the <Suspense> boundary above has
// something to suspend on; both queries run together rather than in series.
async function DashboardTrends() {
  const [signups, activity] = await Promise.all([getSignupStats(), getActivityTrends()]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SignupStats data={signups} />
      <ActivityTrends data={activity} />
    </div>
  );
}

// Placeholder for the streaming wave. Bars use --color-border, NOT the shared
// Skeleton: that component fills with --color-bg-muted, which is this shell's
// canvas colour, so a skeleton on the canvas is invisible. Real sr-only text,
// because a live region is announced from its content — an aria-label alone
// announces nothing.
function TrendsFallback() {
  return (
    <div role="status" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <span className="sr-only">Loading signup and activity trends…</span>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
        >
          <div className="h-5 w-36 animate-pulse rounded bg-[var(--color-border)]" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-[var(--color-border)]" />
          <div className="mt-5 h-[140px] animate-pulse rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}
