'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@jobportal/ui';
import { Search, X } from '@jobportal/ui/icons';
// Imported, not declared here: 'use client' would make these client-only and
// the server page needs readSort() too. See lib/applications/sort.ts.
import { DEFAULT_SORT, SORT_OPTIONS, readSort } from '../../lib/applications/sort';

// Search + sort for the applications list. Modelled on components/srp/SortSelect
// — native <select> in a <label>, useTransition, "Sort by" hidden below sm — so
// the two sort controls in this app behave and look the same.
//
// URL-DRIVEN, like the status chips beside it: ?q= and ?sort= live in the
// address bar so a filtered view is shareable, survives a refresh, and responds
// to back/forward. It also keeps the filtering on the server, which matters
// because the list is paginated — client-side filtering would only ever search
// the ten rows that happen to be on screen.

const DEBOUNCE_MS = 300;

export function ApplicationsToolbar({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const urlQuery = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(urlQuery);

  // Keep the box in step when the URL changes from OUTSIDE this component —
  // back/forward, or the empty state's "clear the filter" link.
  //
  // The ref is what stops this from eating keystrokes. Naively syncing on every
  // urlQuery change loses characters during fast typing: type "Nimbus", the
  // debounce fires after "Nim", the URL becomes ?q=Nim, and this effect then
  // overwrites the draft the user has already extended — the box visibly snaps
  // back to "Nim". Recording the value WE pushed lets the effect recognise its
  // own echo and leave the draft alone, while still syncing for any change it
  // did not cause.
  const lastPushed = useRef<string | null>(null);
  useEffect(() => {
    if (lastPushed.current !== null && urlQuery === lastPushed.current) {
      lastPushed.current = null;
      return;
    }
    setDraft(urlQuery);
  }, [urlQuery]);

  function buildHref(next: { q?: string; sort?: string }): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || (key === 'sort' && value === DEFAULT_SORT)) params.delete(key);
      else params.set(key, value);
    }
    // Any change to the query or the ordering invalidates the current page
    // number — page 3 of the old result set is meaningless in the new one.
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Debounced so a five-word search is one navigation rather than five, and
  // `replace` rather than `push` so typing does not bury the previous page under
  // a stack of history entries the back button has to walk out of.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onSearchChange(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastPushed.current = value;
      startTransition(() => router.replace(buildHref({ q: value })));
    }, DEBOUNCE_MS);
  }

  function clearSearch() {
    clearTimeout(timer.current);
    setDraft('');
    lastPushed.current = '';
    startTransition(() => router.replace(buildHref({ q: '' })));
  }

  const sort = readSort(searchParams.get('sort'));

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={draft}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by job title or company"
          aria-label="Search your applications"
          // aria-controls is deliberately absent: the results are a server
          // re-render of the whole page, not a live region this input owns.
          className="pl-9 pr-9"
        />
        {draft && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <label className="flex shrink-0 items-center gap-2 text-sm text-[var(--color-fg-muted)]">
        <span className="hidden sm:inline">Sort by</span>
        <select
          value={sort}
          onChange={(e) => startTransition(() => router.push(buildHref({ sort: e.target.value })))}
          className="h-9 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Announced politely so a screen-reader user learns the result count
          changed after a debounced search, which is otherwise a silent update.
          Visually redundant — the header already states the count. */}
      <span className="sr-only" role="status" aria-live="polite">
        {resultCount} {resultCount === 1 ? 'application' : 'applications'} found
      </span>
    </div>
  );
}
