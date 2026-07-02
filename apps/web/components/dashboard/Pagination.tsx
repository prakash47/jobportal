import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@jobportal/ui/icons';

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Path the page links point at, e.g. "/applications". */
  baseHref: string;
  /** Extra query params to preserve across page changes (e.g. status filter). */
  params?: Record<string, string>;
}

function hrefFor(baseHref: string, page: number, params?: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  qs.set('page', String(page));
  return `${baseHref}?${qs.toString()}`;
}

function PageButton({
  href,
  disabled,
  children,
  rel,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
  rel: 'prev' | 'next';
}) {
  const base =
    'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm transition-colors';
  if (disabled) {
    // Static span — no disabled semantics needed (aria-disabled is not valid
    // on a role-less generic element).
    return (
      <span
        className={`${base} cursor-not-allowed border-[var(--color-border)] text-[var(--color-fg-subtle)]`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      className={`${base} border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:border-[var(--color-border-strong)]`}
    >
      {children}
    </Link>
  );
}

// Compact prev/next pagination shared by the dashboard list pages. Hidden
// entirely when there is only one page.
export function Pagination({ page, totalPages, baseHref, params }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between">
      <PageButton href={hrefFor(baseHref, page - 1, params)} disabled={page <= 1} rel="prev">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Newer
      </PageButton>
      <span className="text-sm tabular-nums text-[var(--color-fg-muted)]">
        Page {page} of {totalPages}
      </span>
      <PageButton
        href={hrefFor(baseHref, page + 1, params)}
        disabled={page >= totalPages}
        rel="next"
      >
        Older
        <ChevronRight className="size-4" aria-hidden="true" />
      </PageButton>
    </nav>
  );
}
