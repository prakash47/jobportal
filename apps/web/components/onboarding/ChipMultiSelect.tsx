'use client';

import { useState } from 'react';
import { Input } from '@jobportal/ui';
import { X } from '@jobportal/ui/icons';

export interface ChipOption {
  id: number;
  label: string;
  sublabel?: string | null;
}

// Searchable multi-select with removable chips. Chosen items show as navy pills
// (click × to remove); the catalogue below filters as you type and shows the
// addable options. Flat brand styling, no gradients. Reused for skills + cities.
export function ChipMultiSelect({
  options,
  selected,
  onChange,
  max,
  searchPlaceholder = 'Search…',
}: {
  options: readonly ChipOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
  max?: number;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = new Set(selected);
  const atMax = max !== undefined && selected.length >= max;

  const q = query.trim().toLowerCase();
  const addable = options
    .filter((o) => !selectedSet.has(o.id) && (q === '' || o.label.toLowerCase().includes(q)))
    .slice(0, 60);
  const selectedOptions = options.filter((o) => selectedSet.has(o.id));

  return (
    <div className="space-y-3">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(selected.filter((x) => x !== o.id))}
              aria-label={`Remove ${o.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-600)] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-700)]"
            >
              {o.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />

      <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
        <span>{atMax ? 'Maximum reached — remove one to add another' : 'Tap to add'}</span>
        {max !== undefined && (
          <span>
            {selected.length}/{max}
          </span>
        )}
      </div>

      <div className="scrollbar-slim flex max-h-44 flex-wrap content-start gap-1.5 overflow-y-auto rounded-lg border border-[var(--color-border)] p-3">
        {addable.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">No matches.</p>
        ) : (
          addable.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange([...selected, o.id])}
              disabled={atMax}
              className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-sm font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-primary-600)] hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
