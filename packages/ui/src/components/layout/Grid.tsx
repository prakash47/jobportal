import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: 0 | 2 | 4 | 6 | 8;
}

const COLS_CLASSES: Record<NonNullable<GridProps['cols']>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  12: 'grid-cols-12',
};

const GAP_CLASSES: Record<NonNullable<GridProps['gap']>, string> = {
  0: 'gap-0',
  2: 'gap-2',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export function Grid({ cols = 3, gap = 4, className, ...props }: GridProps) {
  return <div className={cn('grid', COLS_CLASSES[cols], GAP_CLASSES[gap], className)} {...props} />;
}
