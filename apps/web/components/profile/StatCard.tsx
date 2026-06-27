import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';

export interface StatCardProps {
  href: string;
  label: string;
  count: number;
  icon: ReactNode;
  /** Small muted line under the label, e.g. "2 active". */
  hint?: string;
}

// One activity quick-link on the dashboard: a bordered, fully-clickable card
// showing a live count + a link to the full list. Flat surface, border over
// shadow, navy/cyan brand (CLAUDE.md §2).
export function StatCard({ href, label, count, icon, hint }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <div className="flex items-center justify-between">
        <span
          className="flex size-9 items-center justify-center rounded-md bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <ArrowRight
          className="size-4 text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-none text-[var(--color-fg)]">
          {count}
        </div>
        <div className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{hint}</div> : null}
      </div>
    </Link>
  );
}
