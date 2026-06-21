'use client';

import { cn } from '@jobportal/ui';

export interface ChipGroupOption {
  value: string;
  label: string;
}

// Toggleable chip group for multi-select enums (work mode, job type). Flat brand
// styling — selected = navy fill, unselected = bordered. No gradients.
export function ChipGroup({
  options,
  selected,
  onChange,
}: {
  options: readonly ChipGroupOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const set = new Set(selected);
  function toggle(value: string) {
    onChange(set.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2',
              active
                ? 'bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-700)]'
                : 'border border-[var(--color-border-strong)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
