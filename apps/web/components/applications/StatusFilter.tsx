'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { STATUS_LABELS } from './StatusPill';

// Pill-row chips at the top of the dashboard. URL-driven (?status=...) so
// shareable links work and back/forward navigation respects the filter.

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

export function StatusFilter() {
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
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => {
        const active = current === f.value;
        return (
          <Link
            key={f.value}
            href={buildHref(f.value)}
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
