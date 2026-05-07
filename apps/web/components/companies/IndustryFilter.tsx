'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';

export interface IndustryFilterProps {
  industries: { slug: string; name: string }[];
}

// URL-driven pill row mirroring StatusFilter on /applications. ?category= is
// the canonical param name per the SRS spec; switching the filter resets
// ?page so the user lands on page 1 of the filtered set.
export function IndustryFilter({ industries }: IndustryFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('category') ?? 'ALL';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete('category');
    else params.set('category', value);
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div role="tablist" aria-label="Filter by industry" className="flex flex-wrap gap-1.5">
      <FilterChip href={buildHref('ALL')} active={current === 'ALL'}>
        All
      </FilterChip>
      {industries.map((i) => (
        <FilterChip key={i.slug} href={buildHref(i.slug)} active={current === i.slug}>
          {i.name}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
          : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      )}
    >
      {children}
    </Link>
  );
}
