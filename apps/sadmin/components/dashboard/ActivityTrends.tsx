import { TrendingUp } from '@jobportal/ui/icons';
import type { ActivityTrends as ActivityTrendsData } from '../../lib/dashboard/queries';
import { TREND_DAYS } from '../../lib/dashboard/queries';
import { ChartLegend, TrendChart, type Series } from './TrendChart';

// Navy and brand cyan — the two accents the portal already uses, and the pair
// with the clearest separation against the white card. Tokens, never hex.
const JOBS_COLOR = 'var(--color-primary-600)';
const APPS_COLOR = 'var(--color-accent-600)';

export function ActivityTrends({ data }: { data: ActivityTrendsData }) {
  const { jobs, applications, totalJobs, totalApplications } = data;

  // Both series share one Y scale inside TrendChart so the lines are honestly
  // comparable; applications typically dwarf postings, which is itself the
  // interesting shape.
  const series: Series[] = [
    { name: 'Jobs posted', points: jobs, color: JOBS_COLOR },
    { name: 'Applications', points: applications, color: APPS_COLOR },
  ];

  return (
    <section
      aria-labelledby="sadmin-activity-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="sadmin-activity-heading"
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-fg)]"
      >
        <TrendingUp className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
        Platform activity
      </h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {totalJobs.toLocaleString('en-IN')} job
        {totalJobs === 1 ? '' : 's'} posted and {totalApplications.toLocaleString('en-IN')}{' '}
        application
        {totalApplications === 1 ? '' : 's'} in the last {TREND_DAYS} days. Days are IST.
      </p>

      <div className="mt-4">
        <TrendChart
          title={`Jobs posted and applications received per day, last ${TREND_DAYS} days`}
          variant="line"
          height={140}
          emptyMessage={`No jobs posted and no applications received in the last ${TREND_DAYS} days.`}
          series={series}
        />
        <ChartLegend series={series} />
      </div>
    </section>
  );
}
