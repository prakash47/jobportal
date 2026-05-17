'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from '@jobportal/ui/icons';
import { cn } from '@jobportal/ui';
import { EVENTS, track } from '../../lib/analytics/posthog';

interface SuggestResponse {
  suggestions: string[];
}

export type SearchInputSize = 'sm' | 'lg';

export function SearchInput({
  initialValue = '',
  size = 'sm',
  autoFocus = false,
}: {
  initialValue?: string;
  size?: SearchInputSize;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  // FR-4.1.7 — debounce 200ms.
  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      void fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SuggestResponse>) : { suggestions: [] }))
        .then((data) => setSuggestions(data.suggestions))
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  function navigateTo(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;
    setOpen(false);
    // Phase 1 item 18 — record the query length, not the query itself.
    // The literal text can contain PII (e.g. "jobs near 123 Main St")
    // and we don't need it for analytics; the length distribution +
    // submission rate are the signals we want.
    track(EVENTS.SEARCH_PERFORMED, { queryLength: trimmed.length });
    startTransition(() => {
      router.push(`/jobs?q=${encodeURIComponent(trimmed)}`);
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigateTo(value);
  }

  const isLg = size === 'lg';

  return (
    <form onSubmit={onSubmit} className="relative w-full" role="search">
      <div className="relative">
        <Search
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]',
            isLg ? 'size-5' : 'size-4',
          )}
          aria-hidden="true"
        />
        <input
          type="search"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search jobs by title, skill, or company"
          aria-label="Search jobs"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          className={cn(
            'w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
            'placeholder:text-[var(--color-fg-subtle)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
            isLg ? 'h-14 pl-11 pr-3 text-base' : 'h-9 pl-9 pr-3 text-sm',
          )}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-md"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown fires before onBlur; prevents the input from
                  // closing the menu before the click is registered.
                  e.preventDefault();
                  navigateTo(s);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
