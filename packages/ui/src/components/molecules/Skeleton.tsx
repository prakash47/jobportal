import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

// Shimmer-free skeleton — restrained per CLAUDE.md §2 (no playful motion).
// Uses a subtle pulse instead of a sweeping gradient.
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[var(--color-bg-muted)]', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
