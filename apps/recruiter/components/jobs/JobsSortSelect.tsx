'use client';

import { useId } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from '@jobportal/ui/icons';
import { Label } from '@jobportal/ui';
import { SELECT_CLASS } from './JobsFilterBar';
import {
  JOBS_SORT_DEFAULT,
  JOBS_SORT_LABELS,
  JOBS_SORT_ORDER,
  parseJobsSort,
} from './jobs-list-params';

/**
 * Mobile-only "Sort by" select for the Jobs list — the card layout (below md)
 * has no column headers to click, so sorting gets a dedicated control there.
 * Hidden at md+ where the sortable table headers take over. Same URL rules as
 * the headers: default omitted, `page` cleared, every other param preserved.
 */
export function JobsSortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();

  const sort = parseJobsSort(searchParams.get('sort'));

  function onChange(value: string) {
    const next = parseJobsSort(value);
    const params = new URLSearchParams(searchParams.toString());
    if (next === JOBS_SORT_DEFAULT) params.delete('sort');
    else params.set('sort', next);
    params.delete('page');
    const qs = params.toString();
    // push (not replace) — the desktop sort headers are <Link>s, so the same
    // action must create a history entry on mobile too (Back returns to the
    // previous sort, not the previous page/route).
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Label htmlFor={id} className="shrink-0">
        Sort by
      </Label>
      <div className="relative flex-1">
        <select id={id} value={sort} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
          {JOBS_SORT_ORDER.map((key) => (
            <option key={key} value={key}>
              {JOBS_SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
        />
      </div>
    </div>
  );
}
