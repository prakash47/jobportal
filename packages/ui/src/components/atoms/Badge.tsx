import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

// Badge text is 12px / weight 500 — NORMAL text under WCAG, so it needs 4.5:1,
// not the 3:1 that large text gets.
//
// `success` and `danger` used to take their text straight from
// --color-success / --color-danger. Those tokens are tuned to be readable as a
// FILL (a solid button, a progress stroke) and are far too light to sit as TEXT
// on their own pale tint: canvas-measured, success was 2.65:1 and danger 3.61:1
// — both failing, success badly.
//
// The fix is the recipe `warning` was already using and the other two were not:
// hold the pale tint as the background and darken the TEXT to lightness 0.45.
// That brings all five variants into one 6-7:1 band (neutral 7.14, primary
// 15.17, success 6.09, warning 6.65, danger 6.66) so they read as a set.
//
// The --color-success / --color-danger TOKENS are deliberately untouched: they
// are correct for fills, and changing them would move every button, ring and
// border that uses them across all three apps.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
  primary: 'bg-[var(--color-primary-100)] text-[var(--color-primary-800)]',
  success: 'bg-[oklch(0.95_0.05_145)] text-[oklch(0.45_0.15_145)]',
  warning: 'bg-[oklch(0.96_0.05_80)] text-[oklch(0.45_0.15_80)]',
  danger:  'bg-[oklch(0.95_0.05_25)] text-[oklch(0.45_0.17_25)]',
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
