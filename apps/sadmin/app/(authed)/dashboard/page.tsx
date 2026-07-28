import type { Metadata } from 'next';
// Building2 / Users / Briefcase read as employer side · candidate side · the
// listings themselves. All three are already exported by the shared icons
// barrel, so packages/ui stays byte-untouched by this PR (the barrel is an
// explicit allowlist — `import * from 'lucide-react'` is banned — and appending
// to it, while lock-free, is a shared-surface edit worth not making for one glyph).
import { Briefcase, Building2, Users } from '@jobportal/ui/icons';
import { getPlatformKpis } from '../../../lib/dashboard/queries';
import { KpiCard } from '../../../components/dashboard/KpiCard';

export const metadata: Metadata = {
  title: 'Dashboard — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Platform-wide totals. Three counts in one Promise.all — cheap enough that the
// page awaits them directly and the route-level loading.tsx acts as the
// streaming boundary, rather than adding a <Suspense> island for ~3 indexed
// COUNT queries.
//
// Only metrics with real backing data appear here. Anything the schema cannot
// answer honestly (job views/impressions — there is no view or event table
// anywhere; time-to-hire — Application.statusHistory is unpopulated on
// historical rows) is omitted rather than faked, per the precedent the
// recruiter dashboard set.
export default async function DashboardPage() {
  const kpis = await getPlatformKpis();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Platform totals across Career Queue.
        </p>
      </div>

      <section aria-labelledby="sadmin-kpi-heading" className="mt-6">
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
    </>
  );
}
