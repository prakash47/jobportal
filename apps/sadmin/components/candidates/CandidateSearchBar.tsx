'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from '@jobportal/ui/icons';
import { Input } from '@jobportal/ui';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search for the candidate master list. Fully URL/searchParams-driven so it
 * composes with the page's server-side pagination: it writes `?q`, the parent
 * RSC re-reads the params and re-queries Prisma.
 *
 * This is a client island rather than a plain GET `<form>` on purpose. This app
 * sets basePath '/sadmin', which next/link and the router apply themselves but
 * which is NOT applied to a raw HTML form `action` — a form would submit to the
 * origin root and 404. Modelled on apps/recruiter's JobsFilterBar, the repo's
 * only other search-into-URL control, and deliberately copied whole: each of the
 * refs below fixes a bug that the naive version has.
 */
export function CandidateSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // HTML ids must be unique on a page (COLLABORATION.md §4.3). useId makes a
  // collision impossible even if this bar is ever rendered twice.
  const searchInputId = useId();

  const urlQuery = searchParams.get('q') ?? '';

  // Latest searchParams, read at debounce-fire time rather than the render-time
  // snapshot, so a trailing commit MERGES with — rather than clobbers — any
  // other param that changed during the debounce window.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // The box is a controlled input debounced into the URL, so it keeps focus and
  // caret position while the RSC re-renders. The URL stays the source of truth,
  // but we re-sync the input only on a GENUINE external change (back/forward,
  // Clear) — tracked via the last value THIS component committed. Without that
  // guard the URL catching up to the user's own typing reverts the input,
  // stripping trailing spaces and jumping the caret mid-word.
  const [query, setQuery] = useState(urlQuery);
  const lastCommittedQueryRef = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== lastCommittedQueryRef.current) {
      lastCommittedQueryRef.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function commit(value: string) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (value) params.set('q', value);
    else params.delete('q');
    // Any search change must return to page 1. Without this, narrowing the
    // results while on page 3 lands the admin on an out-of-range page of the
    // filtered set.
    params.delete('page');
    const qs = params.toString();
    // replace, not push: debounced keystrokes would otherwise fill the history
    // stack, and Back would walk the admin through every prefix they typed.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      lastCommittedQueryRef.current = trimmed;
      commit(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastCommittedQueryRef.current = '';
    setQuery('');
    commit('');
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
        />
        <Input
          id={searchInputId}
          type="search"
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email…"
          // The label states the scope so an admin is not searching blind: this
          // matches name and email only, not headline, phone or id.
          aria-label="Search candidates by name or email"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
