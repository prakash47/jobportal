'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  COUNTRIES,
  countryByIso,
  flagStyle,
  searchCountries,
  type Country,
} from '../../lib/phone/countries';

/**
 * Country dial-code picker for the phone fields.
 *
 * A button + popover listbox rather than a native `<select>`, for two reasons a
 * select cannot meet: an option cannot carry an image, and a 248-row select
 * cannot be searched by anything but first letter.
 *
 * The flags come from a single sprite in `public/`, so the artwork never enters
 * the JS bundle and cannot eat into the 150 KB first-load budget. Flag EMOJI
 * were ruled out on measurement rather than taste — Windows ships no flag
 * glyphs, so U+1F1EE U+1F1F3 renders as the letters "IN" (0 coloured pixels of
 * 336, measured in a real browser here), which is most of our traffic.
 */
export interface CountryCodeSelectProps {
  /** ISO 3166-1 alpha-2 of the selected country. */
  value: string;
  onChange: (iso: string) => void;
  /** Ties the control to the visible field label for screen readers. */
  ariaLabelledBy?: string;
  disabled?: boolean;
}

export function CountryCodeSelect({
  value,
  onChange,
  ariaLabelledBy,
  disabled,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // useId, not a hand-written string: this control appears on the signup form
  // AND the profile form, and both can be mounted at once behind a modal.
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = countryByIso(value);
  const results = useMemo(() => searchCountries(query), [query]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Opening lands the highlight on the CURRENT country rather than the top of
  // the list, so Enter twice is a no-op instead of silently selecting Andorra.
  const openList = useCallback(() => {
    if (disabled) return;
    setQuery('');
    const i = COUNTRIES.findIndex((c) => c[0] === selected[0]);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  }, [disabled, selected]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view when it moves by keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active];
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, close]);

  const choose = (c: Country) => {
    onChange(c[0]);
    close(true);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[active];
      if (hit) choose(hit);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={ariaLabelledBy}
        aria-label={`Country calling code: ${selected[1]} ${selected[2]}`}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openList();
          }
        }}
        className={[
          'flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm',
          'bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
          'border-[var(--color-border-strong)] transition-colors',
          'hover:border-[var(--color-fg)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="block shrink-0 rounded-[2px] ring-1 ring-inset ring-[color-mix(in_oklch,var(--color-fg),transparent_85%)]"
          style={flagStyle(selected[3], selected[4])}
        />
        <span className="tabular-nums">{selected[2]}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 text-[var(--color-fg-muted)]">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className={[
            'absolute left-0 top-[calc(100%+6px)] z-50 w-[19rem] max-w-[80vw]',
            'overflow-hidden rounded-lg border border-[var(--color-border)]',
            // Elevation is the one place CLAUDE.md allows a shadow over a border.
            'bg-[var(--color-bg-elevated)] shadow-lg',
          ].join(' ')}
        >
          <div className="border-b border-[var(--color-border)] p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              autoComplete="off"
              placeholder="Search country or code"
              aria-label="Search country or code"
              aria-controls={listId}
              aria-activedescendant={results[active] ? optionId(active) : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className={[
                'h-8 w-full rounded-md border px-2.5 text-sm',
                'border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-fg)]',
                'placeholder:text-[var(--color-fg-muted)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
              ].join(' ')}
            />
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Country calling code"
            className="max-h-64 overflow-y-auto p-1"
          >
            {results.map((c, i) => {
              const isSelected = c[0] === selected[0];
              return (
                <li
                  key={c[0]}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={[
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                    i === active ? 'bg-[var(--color-bg-muted)]' : '',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="block shrink-0 rounded-[2px] ring-1 ring-inset ring-[color-mix(in_oklch,var(--color-fg),transparent_85%)]"
                    style={flagStyle(c[3], c[4])}
                  />
                  <span className="min-w-0 flex-1 truncate">{c[1]}</span>
                  <span className="tabular-nums text-[var(--color-fg-muted)]">{c[2]}</span>
                </li>
              );
            })}
            {results.length === 0 && (
              <li
                role="presentation"
                className="px-3 py-4 text-center text-sm text-[var(--color-fg-muted)]"
              >
                No country matches that.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
