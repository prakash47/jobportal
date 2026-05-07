'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: (number | 'ellipsis')[] = [1];
  if (current > 3) out.push('ellipsis');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i += 1) {
    out.push(i);
  }
  if (current < total - 2) out.push('ellipsis');
  out.push(total);
  return out;
}

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  const pages = pageNumbers(page, totalPages);
  const baseBtn =
    'inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2';

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        className={cn(baseBtn, 'hover:bg-[var(--color-bg-muted)]')}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={`e-${i}`}
            className="inline-flex size-8 items-center justify-center text-sm text-[var(--color-fg-subtle)]"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              baseBtn,
              p === page
                ? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
                : 'hover:bg-[var(--color-bg-muted)]',
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={cn(baseBtn, 'hover:bg-[var(--color-bg-muted)]')}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
