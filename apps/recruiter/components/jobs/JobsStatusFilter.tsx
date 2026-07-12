'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Open' },
  { value: 'PENDING_MODERATION', label: 'Pending' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

// URL-driven pill row mirroring StatusFilter on /applications and
// IndustryFilter on /companies. Resets ?page on toggle.
export function JobsStatusFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('status') ?? 'ALL';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete('status');
    else params.set('status', value);
    params.delete('page');
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
