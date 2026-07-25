import type { ApplicationStatus } from '../../lib/dashboard/queries';

// The candidate pipeline, stage by stage. Built from plain tokens and divs —
// the repo has no charting dependency and adding one for six bars would not
// earn its weight (the same approach ReachMeter and SalaryTrendsPanel take).
//
// Bars are scaled against the largest stage, not against the total, so the
// shape stays readable when the top of the funnel dwarfs the bottom (which it
// always does). The number, not the bar, is the source of truth.

const STAGES: ReadonlyArray<{ status: ApplicationStatus; label: string }> = [
  { status: 'APPLIED', label: 'Applied' },
  { status: 'IN_REVIEW', label: 'In review' },
  { status: 'SHORTLISTED', label: 'Shortlisted' },
  { status: 'INTERVIEWED', label: 'Interviewed' },
  { status: 'OFFERED', label: 'Offered' },
  { status: 'HIRED', label: 'Hired' },
];

export function HiringFunnel({
  appsByStatus,
}: {
  appsByStatus: Record<ApplicationStatus, number>;
}) {
  const max = Math.max(...STAGES.map((s) => appsByStatus[s.status]), 0);
  const closed = appsByStatus.REJECTED + appsByStatus.WITHDRAWN;

  return (
    <section
      aria-labelledby="hiring-funnel-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="hiring-funnel-heading" className="text-sm font-semibold text-[var(--color-fg)]">
        Candidate pipeline
      </h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Where every application your company has received currently sits.
      </p>

      <dl className="mt-4 space-y-3">
        {STAGES.map(({ status, label }) => {
          const value = appsByStatus[status];
          // A non-zero stage always shows a sliver, so "small" never reads as
          // "none"; zero stays a flat empty track.
          const pct = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
          return (
            <div key={status} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
              <dt className="truncate text-sm text-[var(--color-fg-muted)]">{label}</dt>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-muted)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--color-primary-600)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <dd
                className={
                  value === 0
                    ? 'text-right text-sm tabular-nums text-[var(--color-fg-muted)]'
                    : 'text-right text-sm font-medium tabular-nums text-[var(--color-fg)]'
                }
              >
                {value.toLocaleString('en-IN')}
              </dd>
            </div>
          );
        })}
      </dl>

      {closed > 0 && (
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-fg-muted)]">
          {appsByStatus.REJECTED.toLocaleString('en-IN')} rejected and{' '}
          {appsByStatus.WITHDRAWN.toLocaleString('en-IN')} withdrawn are not shown above.
        </p>
      )}
    </section>
  );
}
