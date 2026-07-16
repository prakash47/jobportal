'use client';

import Link from 'next/link';
import { useId } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn, Label } from '@jobportal/ui';
import { ChevronDown, ChevronLeft, ChevronRight } from '@jobportal/ui/icons';
import { SELECT_CLASS } from './JobsFilterBar';
import { PER_PAGE_DEFAULT, PER_PAGE_OPTIONS, parsePerPage, type PerPage } from './jobs-list-params';

export interface JobsPaginationProps {
  page: number;
  totalPages: number;
  /** Total matching jobs (drives whether the per-page control is useful). */
  total: number;
  perPage: PerPage;
}

/**
 * Pagination bar for the Jobs list: a results-per-page select plus Previous /
 * numbered page links (with ellipsis windowing) / Next. URL-driven — hrefs are
 * built from the live query string so every active filter + sort survives;
 * `page` is dropped at 1 and `perPage` at the default so canonical URLs stay
 * clean. Changing the page size returns to page 1 (a page index only means
 * anything at the size it was computed for).
 */
export function JobsPagination({ page, totalPages, total, perPage }: JobsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const perPageId = useId();

  // With ≤ the smallest page size there is nothing to paginate AND no page-size
  // choice that changes anything — render nothing (the old bar behaved the same
  // via its `totalPages > 1` gate).
  if (total <= PER_PAGE_OPTIONS[0]) return null;

  function hrefFor(target: number): string {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete('page');
    else params.set('page', String(target));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function onPerPageChange(value: string) {
    const next = parsePerPage(value);
    const params = new URLSearchParams(searchParams.toString());
    if (next === PER_PAGE_DEFAULT) params.delete('perPage');
    else params.set('perPage', String(next));
    params.delete('page'); // a page index is meaningless at a different size
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    // flex-wrap at both levels: with 8+ pages the nav's min-content is ~320px of
    // fixed-size links, so it must be able to drop below the per-page group
    // (480–580px + narrow-md widths) and the page numbers must be able to flow
    // to a second row at 320px (WCAG 1.4.10 reflow) instead of overflowing the pane.
    <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:justify-between">
      <div className="flex items-center gap-2">
        <Label htmlFor={perPageId} className="shrink-0 font-normal text-[var(--color-fg-muted)]">
          Results per page
        </Label>
        <div className="relative">
          <select
            id={perPageId}
            value={String(perPage)}
            onChange={(e) => onPerPageChange(e.target.value)}
            className={cn(SELECT_CLASS, 'w-20')}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
          />
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination">
          <ul className="flex flex-wrap items-center gap-1">
            <li>
              <EdgeLink
                href={hrefFor(page - 1)}
                disabled={page <= 1}
                label="Previous page"
                Icon={ChevronLeft}
              />
            </li>
            {pageItems(page, totalPages).map((item, i) => (
              // aria-hidden on the ellipsis LI (not just the glyph) so screen
              // readers don't count a blank list item they can't perceive.
              <li key={item === 'ellipsis' ? `e${i}` : item} aria-hidden={item === 'ellipsis' || undefined}>
                {item === 'ellipsis' ? (
                  <span className="inline-flex size-8 items-center justify-center text-sm text-[var(--color-fg-muted)]">
                    …
                  </span>
                ) : (
                  <Link
                    href={hrefFor(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? 'page' : undefined}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                      item === page
                        ? 'bg-[var(--color-fg)] font-medium text-[var(--color-bg)]'
                        : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]',
                    )}
                  >
                    {item}
                  </Link>
                )}
              </li>
            ))}
            <li>
              <EdgeLink
                href={hrefFor(page + 1)}
                disabled={page >= totalPages}
                label="Next page"
                Icon={ChevronRight}
              />
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Previous/Next chevron link; a non-interactive dimmed span at the bounds. */
function EdgeLink({
  href,
  disabled,
  label,
  Icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  Icon: typeof ChevronLeft;
}) {
  const base = 'inline-flex size-8 items-center justify-center rounded-md';
  if (disabled) {
    // role="link" so the aria-label/aria-disabled are honoured — ARIA prohibits
    // naming a role-less (generic) span, which would leave this announced as a
    // blank list item. No href/tabindex keeps it out of the tab order.
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={label}
        className={cn(base, 'cursor-not-allowed text-[var(--color-fg-subtle)]')}
      >
        <Icon aria-hidden className="size-4" />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        base,
        'text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
      )}
    >
      <Icon aria-hidden className="size-4" />
    </Link>
  );
}

/**
 * Page-number windowing — the same shape as the design-system Pagination and
 * the seeker SRP: every page when there are ≤ 7, else first + last with a
 * ±1 window around the current page and ellipses for the gaps.
 */
function pageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | 'ellipsis')[] = [1];
  if (current > 3) items.push('ellipsis');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
  if (current < total - 2) items.push('ellipsis');
  items.push(total);
  return items;
}
