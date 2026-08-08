'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { Check, Filter } from '@jobportal/ui/icons';
import type { DirectorySort } from '@jobportal/domain/company-params';

export interface CompanyFiltersProps {
  industries: { slug: string; name: string; count: number }[];
  activeCategory: string | null;
  activeSort: DirectorySort;
  hiring: boolean;
  /** Show the iconed "Filters" header. Off inside the mobile sheet (its
   *  DialogTitle already reads "Filters"), on for the desktop sidebar. */
  showTitle?: boolean;
  /** Render bare (no card chrome) — used inside the mobile sheet, which is
   *  already an elevated panel. Desktop renders the elevated card. */
  bare?: boolean;
}

const SORT_OPTIONS: ReadonlyArray<{ value: DirectorySort; label: string }> = [
  { value: 'rating', label: 'Top rated' },
  { value: 'reviews', label: 'Most reviewed' },
  { value: 'name', label: 'A–Z' },
];

// The directory filter panel — an elevated, modern faceted-filter card rendered
// in the sticky desktop sidebar, and bare inside the mobile <MobileFilterSheet>.
// Single-select groups (sort, industry) use radio affordances; the hiring
// toggle is a checkbox. Every control is a URL-driven <Link> (no client state),
// so it works server-rendered and stays shareable. Any change resets ?page.
export function CompanyFilters({
  industries,
  activeCategory,
  activeSort,
  hiring,
  showTitle = true,
  bare = false,
}: CompanyFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefWith(mut: (p: URLSearchParams) => void): string {
    const p = new URLSearchParams(searchParams.toString());
    mut(p);
    p.delete('page');
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }
  const sortHref = (v: DirectorySort) =>
    hrefWith((p) => (v === 'rating' ? p.delete('sort') : p.set('sort', v)));
  const categoryHref = (slug: string | null) =>
    hrefWith((p) => (slug ? p.set('category', slug) : p.delete('category')));
  const hiringHref = hrefWith((p) => (hiring ? p.delete('hiring') : p.set('hiring', '1')));

  const activeCount = (activeCategory !== null ? 1 : 0) + (hiring ? 1 : 0) + (activeSort !== 'rating' ? 1 : 0);

  const clearAll =
    activeCount > 0 ? (
      <Link
        href={pathname}
        className="text-xs font-medium text-[var(--color-accent-700)] hover:underline"
      >
        Clear all
      </Link>
    ) : null;

  const body = (
    <div className="space-y-5">
      <FilterGroup title="Sort by">
        {SORT_OPTIONS.map((o) => (
          <RadioRow key={o.value} href={sortHref(o.value)} active={activeSort === o.value}>
            {o.label}
          </RadioRow>
        ))}
      </FilterGroup>

      <FilterGroup title="Availability">
        <Link
          href={hiringHref}
          aria-current={hiring ? 'true' : undefined}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
        >
          <span
            aria-hidden="true"
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
        <RadioRow href={categoryHref(null)} active={activeCategory === null}>
          All industries
        </RadioRow>
        {industries.map((i) => (
          <RadioRow
            key={i.slug}
            href={categoryHref(i.slug)}
            active={activeCategory === i.slug}
            count={i.count}
          >
            {i.name}
          </RadioRow>
        ))}
      </FilterGroup>
    </div>
  );

  const header = showTitle ? (
    <div className="mb-4 flex items-center justify-between border-b border-[var(--color-border)] pb-4">
      <div className="flex items-center gap-2">
        <Filter className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Filters</h2>
        {activeCount > 0 && (
          <span className="rounded-full bg-[var(--color-primary-600)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {activeCount}
          </span>
        )}
      </div>
      {clearAll}
    </div>
  ) : clearAll ? (
    <div className="mb-3 flex justify-end">{clearAll}</div>
  ) : null;

  if (bare) {
    return (
      <div>
        {header}
        {body}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      {header}
      {body}
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

// Single-select row with a radio affordance + optional count pill.
function RadioRow({
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
        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'text-[var(--color-fg)]'
          : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          active ? 'border-[var(--color-primary-600)]' : 'border-[var(--color-border-strong)]',
        )}
      >
        {active && <span className="size-1.5 rounded-full bg-[var(--color-primary-600)]" />}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
            active
              ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
              : 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
