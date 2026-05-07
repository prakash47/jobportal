import type { ReactNode } from 'react';

// Fixed-bottom bar on mobile only. Hosts the Filters trigger and a result
// count summary. Hidden on md+ where the desktop sidebar is always visible.
export function MobileStickyBar({
  resultCount,
  filterTrigger,
  sortTrigger,
}: {
  resultCount: number;
  filterTrigger: ReactNode;
  sortTrigger: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-fg-muted)]">
          {resultCount.toLocaleString('en-IN')} jobs
        </span>
        <div className="flex items-center gap-2">
          {sortTrigger}
          {filterTrigger}
        </div>
      </div>
    </div>
  );
}
