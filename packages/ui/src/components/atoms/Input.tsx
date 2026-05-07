'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-[var(--color-danger)]'
          : 'border-[var(--color-border-strong)] focus-visible:border-[var(--color-fg)]',
        className,
      )}
      {...props}
    />
  );
});
