'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import type { DirectorySort } from '../../lib/companies/params';

export interface CompanyFiltersProps {
  industries: { slug: string; name: string; count: number }[];
  activeCategory: string | null;
  activeSort: DirectorySort;
  hiring: boolean;
  /** Show the "Filters" heading. Off inside the mobile sheet (the DialogTitle
   *  already reads "Filters"), on for the desktop sidebar. Default true. */
  showTitle?: boolean;
}

const SORT_OPTIONS: ReadonlyArray<{ value: DirectorySort; label: string }> = [
  { value: 'rating', label: 'Top rated' },
  { value: 'reviews', label: 'Most reviewed' },
  { value: 'name', label: 'A–Z' },
];

// The directory filter panel — rendered both in the sticky desktop sidebar and
// inside the mobile <MobileFilterSheet>. Every control is a URL-driven <Link>
// (no client state), so it works server-rendered and keeps the URL shareable.
// Changing any filter resets ?page to 1.
export function CompanyFilters({
  industries,
  activeCategory,
  activeSort,
  hiring,
  showTitle = true,
}: CompanyFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefWith(mut: (p: URLSearchParams) => void): string {
    const p = new URLSearchParams(searchParams.toString());
    mut(p);
    p.delete('page'); // any filter change resets to page 1
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }
  const sortHref = (v: DirectorySort) =>
    hrefWith((p) => (v === 'rating' ? p.delete('sort') : p.set('sort', v)));
  const categoryHref = (slug: string | null) =>
    hrefWith((p) => (slug ? p.set('category', slug) : p.delete('category')));
  const hiringHref = hrefWith((p) => (hiring ? p.delete('hiring') : p.set('hiring', '1')));

  const hasActiveFilter = activeCategory !== null || hiring || activeSort !== 'rating';

  return (
    <div className="space-y-6">
      {(showTitle || hasActiveFilter) && (
        <div className={cn('flex items-center', showTitle ? 'justify-between' : 'justify-end')}>
          {showTitle && <h2 className="text-sm font-semibold text-[var(--color-fg)]">Filters</h2>}
          {hasActiveFilter && (
            <Link
              href={pathname}
              className="text-xs font-medium text-[var(--color-accent-700)] hover:underline"
            >
              Clear all
            </Link>
          )}
        </div>
      )}

      <FilterGroup title="Sort by">
        {SORT_OPTIONS.map((o) => (
          <OptionRow key={o.value} href={sortHref(o.value)} active={activeSort === o.value}>
            {o.label}
          </OptionRow>
        ))}
      </FilterGroup>

      <FilterGroup title="Availability">
        <Link
          href={hiringHref}
          aria-current={hiring ? 'true' : undefined}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
        >
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
              hiring
                ? 'border-[var(--color-accent-600)] bg-[var(--color-accent-600)] text-white'
                : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]',
            )}
          >
            {hiring && <Check className="size-3" aria-hidden="true" />}
          </span>
          <span className={hiring ? 'font-medium text-[var(--color-fg)]' : ''}>Currently hiring</span>
        </Link>
      </FilterGroup>

      <FilterGroup title="Industry">
        <OptionRow href={categoryHref(null)} active={activeCategory === null}>
          All industries
        </OptionRow>
        {industries.map((i) => (
          <OptionRow key={i.slug} href={categoryHref(i.slug)} active={activeCategory === i.slug} count={i.count}>
            {i.name}
          </OptionRow>
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function OptionRow({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'bg-[var(--color-primary-50)] font-medium text-[var(--color-primary-700)]'
          : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            active ? 'text-[var(--color-primary-700)]' : 'text-[var(--color-fg-muted)]',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
