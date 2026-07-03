import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from '@jobportal/ui/icons';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned action slot (usually one primary Button). */
  action?: ReactNode;
  /** Optional back-link for nested pages (e.g. /alerts/new → /alerts). */
  backHref?: string;
  backLabel?: string;
}

// Standard header for every dashboard page: back-link (nested pages only),
// title + one-line description, and a right-aligned action slot. Keeping this
// in one place is what keeps the pages from drifting apart (CLAUDE.md §2).
export function PageHeader({ title, description, action, backHref, backLabel }: PageHeaderProps) {
  return (
    <header className="space-y-1">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-1 inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {backLabel ?? 'Back'}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}
