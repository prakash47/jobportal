'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@jobportal/ui';
import { Check, ChevronDown, X } from '@jobportal/ui/icons';
import { filterOptions, type ComboboxOption } from '../../lib/ui/combobox-filter';

export type { ComboboxOption };

/**
 * The open/close + keyboard machinery shared by both comboboxes.
 *
 * Implements the ARIA 1.2 combobox pattern: the input keeps DOM focus at all
 * times and `aria-activedescendant` moves the *virtual* cursor, so a screen
 * reader announces the highlighted option without the browser stealing focus
 * into the list. That is why option rows are plain `<li>` with `onMouseDown`
 * rather than buttons — a button would take focus and close the popup before
 * its own click handler could run.
 */
function useComboboxBehaviour(optionCount: number) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Clamp when the filtered list shrinks under the cursor.
  const activeIndex = optionCount === 0 ? -1 : Math.min(active, optionCount - 1);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  return { open, setOpen, activeIndex, setActive, rootRef, listRef };
}

function optionRowClass(highlighted: boolean, selected: boolean) {
  return cn(
    'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm',
    highlighted ? 'bg-[var(--color-bg-muted)]' : 'bg-transparent',
    selected ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]',
  );
}

const INPUT_CLASS = cn(
  'h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]',
  'px-3 pr-8 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2',
  'focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50',
);

const LIST_CLASS = cn(
  'absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border',
  'border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-md',
);

/**
 * Multi-select combobox: type to filter, Enter/click to toggle, selections
 * render as removable chips above the field.
 */
export function MultiCombobox({
  id,
  label,
  hint,
  placeholder,
  options,
  selected,
  onChange,
  max,
  emptyLabel = 'No matches',
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  options: ComboboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const { open, setOpen, activeIndex, setActive, rootRef, listRef } = useComboboxBehaviour(
    filtered.length,
  );
  const listId = `${id}-listbox`;
  const hintId = hint ? `${id}-hint` : undefined;

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const atMax = max !== undefined && selected.length >= max;

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
      return;
    }
    if (atMax) return;
    onChange([...selected, value]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const count = filtered.length;
      if (count > 0) setActive((i) => (Math.min(i, count - 1) + delta + count) % count);
      return;
    }
    if (e.key === 'Enter' && open) {
      const option = filtered[activeIndex];
      if (option) {
        e.preventDefault();
        toggle(option.value);
      }
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    // Backspace on an empty query removes the last chip — the standard
    // token-field affordance, so a mistake does not need a mouse.
    if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-fg)]">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
          {hint}
        </p>
      )}

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {selected.map((value) => (
            <li key={value}>
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] py-1 pl-2.5 pr-1 text-xs font-medium text-[var(--color-fg)]">
                {byValue.get(value)?.label ?? value}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((v) => v !== value))}
                  aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
                  className="rounded p-0.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div ref={rootRef} className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={hintId}
          {...(open && activeIndex >= 0 ? { 'aria-activedescendant': `${id}-opt-${activeIndex}` } : {})}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={INPUT_CLASS}
        />
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-muted)]"
          aria-hidden="true"
        />

        {open && (
          <ul ref={listRef} id={listId} role="listbox" aria-multiselectable className={LIST_CLASS}>
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-[var(--color-fg-muted)]">{emptyLabel}</li>
            )}
            {filtered.map((o, i) => {
              const isSelected = selectedSet.has(o.value);
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // Prevent the input losing focus, which would close the list
                    // before the toggle runs.
                    e.preventDefault();
                    toggle(o.value);
                  }}
                  className={optionRowClass(i === activeIndex, isSelected)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-[var(--color-fg-subtle)]">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 text-[var(--color-primary-600)]"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {atMax && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          {max} selected — the maximum. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/**
 * Single-select combobox. Shows the chosen label in the field itself and offers
 * a clear button, so "no selection" stays reachable without a sentinel option
 * (Radix Select forbids an empty-string item value).
 */
export function SingleCombobox({
  id,
  label,
  hint,
  placeholder,
  options,
  value,
  onChange,
  emptyLabel = 'No matches',
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  emptyLabel?: string;
}) {
  const selectedOption = useMemo(
    () => (value === null ? null : (options.find((o) => o.value === value) ?? null)),
    [options, value],
  );
  // While closed the field shows the selection; opening clears it to a blank
  // search box so the user can type immediately instead of deleting the old
  // label first.
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const { open, setOpen, activeIndex, setActive, rootRef, listRef } = useComboboxBehaviour(
    filtered.length,
  );
  const listId = `${id}-listbox`;
  const hintId = hint ? `${id}-hint` : undefined;

  function commit(next: string | null) {
    onChange(next);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const count = filtered.length;
      if (count > 0) setActive((i) => (Math.min(i, count - 1) + delta + count) % count);
      return;
    }
    if (e.key === 'Enter' && open) {
      const option = filtered[activeIndex];
      if (option) {
        e.preventDefault();
        commit(option.value);
      }
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setQuery('');
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-fg)]">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
          {hint}
        </p>
      )}
      <div ref={rootRef} className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={hintId}
          {...(open && activeIndex >= 0 ? { 'aria-activedescendant': `${id}-opt-${activeIndex}` } : {})}
          value={open ? query : (selectedOption?.label ?? '')}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={INPUT_CLASS}
        />
        {value !== null && !open ? (
          <button
            type="button"
            onClick={() => commit(null)}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-muted)]"
            aria-hidden="true"
          />
        )}

        {open && (
          <ul ref={listRef} id={listId} role="listbox" className={LIST_CLASS}>
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-[var(--color-fg-muted)]">{emptyLabel}</li>
            )}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o.value);
                  }}
                  className={optionRowClass(i === activeIndex, isSelected)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-[var(--color-fg-subtle)]">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 text-[var(--color-primary-600)]"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
