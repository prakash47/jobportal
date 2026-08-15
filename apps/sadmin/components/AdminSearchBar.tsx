'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from '@jobportal/ui/icons';
import { Input } from '@jobportal/ui';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The portal's search-into-URL control. Fully URL/searchParams-driven so it
 * composes with each page's server-side tabs and pagination: it writes `?q`, the
 * parent RSC re-reads the params and re-queries Prisma.
 *
 * This is a client island rather than a plain GET `<form>` on purpose. This app
 * sets basePath '/sadmin', which next/link and the router apply themselves but
 * which is NOT applied to a raw HTML form `action` — a form would submit to the
 * origin root and 404.
 *
 * ⚠ EXTRACTED ON ITS OWN TERMS. CandidateSearchBar and JobPostingSearchBar were
 * deliberate whole copies of each other, and JobPostingSearchBar's own comment
 * set the condition for consolidating them: *"If a third copy ever appears, THAT
 * is the moment to extract one."* The Subscriptions console is that third
 * surface, so this is the extraction that comment asked for rather than
 * speculative DRY.
 *
 * The two originals were verified identical in CODE before this was written —
 * every difference between them was a comment or one of the two strings now
 * passed as props — so both keep their names and re-export thin wrappers, and no
 * shipped page changed at all.
 *
 * Each of the refs below fixes a real bug the naive version has: caret jump,
 * history flood, param clobber, and page reset. None is decorative.
 */
export function AdminSearchBar({
  placeholder,
  label,
}: {
  placeholder: string;
  /**
   * The accessible name, which must state the SCOPE of the search so an admin is
   * not searching blind — "by name or email", not just "Search".
   */
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // HTML ids must be unique on a page (COLLABORATION.md §4.3). useId makes a
  // collision impossible even if this bar is ever rendered twice.
  const searchInputId = useId();

  const urlQuery = searchParams.get('q') ?? '';

  // Latest searchParams, read at debounce-fire time rather than the render-time
  // snapshot, so a trailing commit MERGES with — rather than clobbers — any
  // other param that changed during the debounce window. On a tabbed page that
  // is not hypothetical: `?status` is one click away and a stale snapshot would
  // silently throw the admin back to the default tab mid-keystroke.
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
    // filtered set. `status` is deliberately NOT deleted — changing the search
    // must not silently move the admin off the tab they are looking at.
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
          placeholder={placeholder}
          aria-label={label}
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
