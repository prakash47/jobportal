'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { STATUS_LABELS } from './StatusPill';

// Status filter chips. URL-driven (?status=...) so shareable links work and
// back/forward navigation respects the filter. One horizontal scrolling row —
// never wraps into a chip blob on mobile. Counts come from the page's groupBy
// so each chip shows how many applications sit in that state.

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'APPLIED', label: STATUS_LABELS.APPLIED },
  { value: 'IN_REVIEW', label: STATUS_LABELS.IN_REVIEW },
  { value: 'SHORTLISTED', label: STATUS_LABELS.SHORTLISTED },
  { value: 'INTERVIEWED', label: STATUS_LABELS.INTERVIEWED },
  { value: 'OFFERED', label: STATUS_LABELS.OFFERED },
  { value: 'HIRED', label: STATUS_LABELS.HIRED },
  { value: 'REJECTED', label: STATUS_LABELS.REJECTED },
  { value: 'WITHDRAWN', label: STATUS_LABELS.WITHDRAWN },
] as const;

export function StatusFilter({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('status') ?? 'ALL';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete('status');
    else params.set('status', value);
    params.delete('page'); // reset paging when the filter changes
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1">
      <div role="tablist" aria-label="Filter by status" className="flex w-max gap-1.5">
        {FILTERS.map((f) => {
          const active = current === f.value;
          const count = counts[f.value] ?? 0;
          // Hide zero-count statuses (except the active one and "All") so the
          // row stays short for typical candidates.
          if (count === 0 && !active && f.value !== 'ALL') return null;
          return (
            <Link
              key={f.value}
              href={buildHref(f.value)}
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
              )}
            >
              {f.label}
              <span className={cn('tabular-nums', active ? 'text-white/75' : 'text-[var(--color-fg-muted)]')}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
