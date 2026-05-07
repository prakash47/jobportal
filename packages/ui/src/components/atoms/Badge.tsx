import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
  primary: 'bg-[var(--color-primary-100)] text-[var(--color-primary-800)]',
  success: 'bg-[oklch(0.95_0.05_145)] text-[var(--color-success)]',
  warning: 'bg-[oklch(0.96_0.05_80)] text-[oklch(0.45_0.15_80)]',
  danger:  'bg-[oklch(0.95_0.05_25)] text-[var(--color-danger)]',
};

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
