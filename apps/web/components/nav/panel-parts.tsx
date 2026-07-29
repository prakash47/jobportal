import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@jobportal/ui';
import { ArrowRight, ChevronRight, Star } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';

// Server-only presentational pieces of "The Console" mega-panel. They are
// rendered on the server and handed to the FacetTabs client island as
// ReactNode slots, so none of this (nor CompanyLogo, nor the url builders)
// reaches the client bundle.

const fmt = (n: number): string => n.toLocaleString('en-IN');

const rowClass =
  'group -mx-2 block rounded-[var(--radius-md)] px-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-primary-50)]';
const labelClass =
  'min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--color-fg)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:text-[var(--color-primary-700)]';

export interface FacetItem {
  key: string;
  label: string;
  href: string;
  count: number;
}

/**
 * Two-column facet list where each row carries an honest proportion bar: the
 * fill is this row's share of the facet's own maximum, so the bars encode real
 * relative demand rather than decoration. Never animated — animating a data
 * length would misrepresent it. The bar is the row's single accent, so these
 * rows deliberately omit the hover chevron (one accent per row).
 */
export function FacetList({ items, noun }: { items: readonly FacetItem[]; noun: string }) {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0) || 1;
  return (
    <ul className="grid grid-cols-2 gap-x-8 gap-y-0.5">
      {items.map((it, index) => {
        // 8% floor keeps a count of 1 visible instead of rendering as nothing.
        const pct = Math.max(8, Math.round((it.count / max) * 100));
        return (
          <li key={it.key}>
            <Link href={it.href} className={cn(rowClass, 'py-2')}>
              <span className="flex items-baseline gap-2">
                <span className={labelClass}>{it.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-fg-muted)]">
                  {fmt(it.count)} {noun}
                  {it.count === 1 ? '' : 's'}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[var(--color-primary-100)]"
              >
                <span
                  style={{ width: `${pct}%` }}
                  className={cn(
                    'block h-full rounded-full',
                    // The leader is capped in cyan so the eye finds the top item.
                    index === 0 ? 'bg-[var(--color-accent-500)]' : 'bg-[var(--color-primary-500)]',
                  )}
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Name-only two-column list (company industry collections). No number is shown
 * on purpose: the only count we hold for an industry is a JOB count, which
 * beside a companies collection would misread as a company count.
 */
export function PlainList({ items }: { items: ReadonlyArray<{ key: string; label: string; href: string }> }) {
  return (
    <ul className="grid grid-cols-2 gap-x-8 gap-y-0.5">
      {items.map((it) => (
        <li key={it.key}>
          <Link href={it.href} className={cn(rowClass, 'relative flex items-center py-2 pr-6')}>
            <span className={labelClass}>{it.label}</span>
            <ChevronRight
              aria-hidden="true"
              className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 -translate-x-1 text-[var(--color-accent-500)] opacity-0 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Single-column directory collections: icon + title + one-line descriptor. */
export function CollectionList({
  items,
}: {
  items: ReadonlyArray<{
    key: string;
    label: string;
    hint: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
  }>;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ key, label, hint, href, icon: Icon }) => (
        <li key={key}>
          <Link href={href} className={cn(rowClass, 'relative flex items-center gap-3 py-2.5 pr-6')}>
            <Icon
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--color-fg-muted)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:text-[var(--color-primary-700)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-[var(--color-fg)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:text-[var(--color-primary-700)]">
                {label}
              </span>
              <span className="mt-px block truncate text-xs text-[var(--color-fg-muted)]">{hint}</span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 -translate-x-1 text-[var(--color-accent-500)] opacity-0 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface EmployerItem {
  id: number;
  name: string;
  logoUrl: string | null;
  averageRating: number | null;
  openingsCount: number;
  href: string;
}

/** Featured employers, two-up. The top-rated row keeps a cyan spotlight bar. */
export function EmployerList({ items }: { items: readonly EmployerItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {items.map((c, index) => (
        <li key={c.id}>
          <Link
            href={c.href}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-[var(--radius-md)] p-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-primary-50)]"
          >
            {index === 0 && (
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-[var(--color-accent-500)]" />
            )}
            <CompanyLogo companyId={c.id} name={c.name} logoUrl={c.logoUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-[var(--color-fg)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:text-[var(--color-primary-700)]">
                {c.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[var(--color-fg-muted)]">
                {c.averageRating != null && (
                  <>
                    <Star aria-hidden="true" className="size-3 text-[var(--color-primary-500)]" />
                    <span className="tabular-nums">
                      <span className="sr-only">Rating </span>
                      {c.averageRating.toFixed(1)}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                {c.openingsCount > 0 ? (
                  <span className="tabular-nums">
                    {c.openingsCount} open {c.openingsCount === 1 ? 'role' : 'roles'}
                  </span>
                ) : (
                  'Profile'
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Live count at the footer's left edge. */
export function FooterCount({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-[12.5px] text-[var(--color-fg-muted)]">
      <span className="text-[13.5px] font-semibold tabular-nums text-[var(--color-primary-600)]">{fmt(value)}</span>{' '}
      {label}
    </span>
  );
}

/** Quiet text link for the footer's honest quick-views. */
export function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[12.5px] text-[var(--color-fg-muted)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:text-[var(--color-primary-700)]"
    >
      {children}
    </Link>
  );
}

/** The panel's single filled element. Navy fill (white ~13:1), cyan arrow. */
export function FooterCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary-600)] px-3.5 text-[13px] font-semibold text-white transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-primary-700)]"
    >
      {label}
      <ArrowRight
        aria-hidden="true"
        className="size-[15px] text-[var(--color-accent-500)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover:translate-x-[3px]"
      />
    </Link>
  );
}
