'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@jobportal/ui';
import { ChevronDown } from '@jobportal/ui/icons';

// Styled native <select>. Native (not a Radix popover) so it renders
// deterministically on the server — no hydration mismatch — and gets the OS
// picker on mobile. Used for the enum dropdowns (experience, notice, industry).
export const FieldSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FieldSelect({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] pl-3 pr-9 text-sm text-[var(--color-fg)]',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-60"
          aria-hidden="true"
        />
      </div>
    );
  },
);
