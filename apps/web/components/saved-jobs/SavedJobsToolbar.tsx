'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@jobportal/ui';
import { Search, X } from '@jobportal/ui/icons';
import { DEFAULT_SORT, SORT_OPTIONS, readSort } from '../../lib/saved-jobs/sort';

// Search + sort for the saved-jobs list. Intentionally the same shape as
// components/applications/ApplicationsToolbar — same debounce, same
// `replace`-not-`push`, same last-pushed ref — so the two dashboard lists
// behave identically. A candidate who learns one has learned the other.
//
// Server-side and URL-driven (?q= / ?sort=): the list is paginated, so a
// client-side filter would only ever search the rows currently on screen.

const DEBOUNCE_MS = 300;

export function SavedJobsToolbar({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const urlQuery = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(urlQuery);

  // The ref stops this eating keystrokes: without it, the debounce landing
  // mid-typing rewrites the URL, and syncing from that URL snaps the box back
  // to a shorter value the user has already typed past.
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
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

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
          placeholder="Search saved jobs by title or company"
          aria-label="Search your saved jobs"
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

      <span className="sr-only" role="status" aria-live="polite">
        {resultCount} saved {resultCount === 1 ? 'job' : 'jobs'} found
      </span>
    </div>
  );
}
