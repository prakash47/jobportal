import { Skeleton } from '@jobportal/ui';

// Placeholders that hold the dashboard's real geometry, so nothing jumps when
// the data lands (CLS budget, CLAUDE.md §8). Skeleton is already aria-hidden;
// the live region announces the wait once instead of the screen reader walking
// a field of empty boxes.

const cardClass = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5';

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className={cardClass}>
      <Skeleton className="h-4 w-36" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Stand-in for the streamed KPI half while its six aggregate queries run. */
export function KpiSkeleton() {
  return (
    <div role="status" className="space-y-6">
      {/* Real text, not an aria-label: a live region announces its CONTENT, and
          every box below is aria-hidden, so an aria-label alone would leave the
          region silent. */}
      <span className="sr-only">Loading your metrics…</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-1 h-3 w-28" />
          </div>
        ))}
      </div>
      <PanelSkeleton rows={3} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelSkeleton rows={6} />
        <PanelSkeleton rows={4} />
      </div>
      <PanelSkeleton rows={5} />
    </div>
  );
}

/**
 * Whole-page fallback for app-router navigation into /dashboard, covering the
 * gap before the server component's own shell arrives (the verification card
 * included — on a cold navigation even its single query has not resolved yet).
 */
export function DashboardPageSkeleton() {
  return (
    <div data-wide className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-4 h-1.5 w-full" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <KpiSkeleton />
    </div>
  );
}
