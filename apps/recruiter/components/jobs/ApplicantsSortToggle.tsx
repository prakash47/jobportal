'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';

const OPTIONS = [
  { value: 'date', label: 'Newest' },
  { value: 'status', label: 'By status' },
] as const;

// URL-driven sort toggle. Clears ?page on sort change so a deep page on the
// old sort doesn't render a confusing empty result.
export function ApplicantsSortToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'date';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'date') params.delete('sort');
    else params.set('sort', value);
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div role="tablist" aria-label="Sort applicants" className="flex gap-1.5">
      {OPTIONS.map((o) => {
        const active = current === o.value;
        return (
          <Link
            key={o.value}
            href={buildHref(o.value)}
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
