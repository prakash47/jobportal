'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@jobportal/ui';

export interface SegmentOption {
  value: string;
  label: string;
}

// Single-select segmented toggle (Work status, Looking for, language
// proficiency). Flat brand styling — active segment is navy fill, no shadow.
// Implements the WAI-ARIA radiogroup keyboard model: one tab stop (roving
// tabindex) + Arrow/Home/End to move and select.
export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  options: readonly SegmentOption[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const activeIndex = options.findIndex((o) => o.value === value);

  function move(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === -1) return;
    const target = options[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] p-1"
    >
      {options.map((o, i) => {
        const active = value === o.value;
        // Roving tabindex: the selected option is the single tab stop; when
        // nothing is selected yet, the first option is tabbable.
        const tabbable = active || (activeIndex === -1 && i === 0);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              'flex-1 rounded-md font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
              size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm',
              active
                ? 'bg-[var(--color-primary-600)] text-white'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
