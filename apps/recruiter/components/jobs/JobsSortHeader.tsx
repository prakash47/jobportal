'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { ChevronDown, ChevronUp } from '@jobportal/ui/icons';
import {
  JOBS_SORT_COLUMNS,
  JOBS_SORT_DEFAULT,
  parseJobsSort,
  type JobsSortColumn,
} from './jobs-list-params';

/**
 * Clickable sort control for a Jobs-table column header. URL-driven like every
 * other list control: clicking an inactive column applies its initial
 * direction, clicking the active column flips direction, and the default sort
 * is deleted from the URL rather than set. Always clears `?page` so a deep
 * page on the old sort doesn't render a confusing empty result (the same rule
 * ApplicantsSortToggle and JobsFilterBar enforce). All other params — filters,
 * per-page — survive because the href is built from the live query string.
 *
 * Rendered INSIDE the `<th>` (which carries `aria-sort`, set server-side by
 * JobsTable from the same parser, so the two can't drift).
 */
export function JobsSortHeader({ column, label }: { column: JobsSortColumn; label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = parseJobsSort(searchParams.get('sort'));

  const col = JOBS_SORT_COLUMNS[column];
  const isAsc = sort === col.asc;
  const isDesc = sort === col.desc;
  const active = isAsc || isDesc;
  const next = active ? (isAsc ? col.desc : col.asc) : col.initial;

  const params = new URLSearchParams(searchParams.toString());
  if (next === JOBS_SORT_DEFAULT) params.delete('sort');
  else params.set('sort', next);
  params.delete('page');
  const qs = params.toString();
  const href = qs ? `${pathname}?${qs}` : pathname;

  // Active column shows its direction solid; an inactive column previews the
  // direction a click would apply, revealed on hover/focus only (kept in the
  // layout so columns don't shift). aria-hidden — direction state is announced
  // by the <th>'s aria-sort, not the icon.
  const Arrow = active ? (isAsc ? ChevronUp : ChevronDown) : col.initial === col.asc ? ChevronUp : ChevronDown;

  return (
    <Link
      href={href}
      className={cn(
        'group/sort inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--color-fg)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        active && 'text-[var(--color-fg)]',
      )}
    >
      {label}
      <Arrow
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50',
        )}
      />
    </Link>
  );
}
