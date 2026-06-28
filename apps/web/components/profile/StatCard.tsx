import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@jobportal/ui';

export interface StatCardProps {
  label: string;
  count: number;
  icon: ReactNode;
  /** Tint classes for the icon chip (bg + text). Defaults to a neutral chip. */
  chipClassName?: string;
  /** When set, the whole card is a link to this href. */
  href?: string;
}

// A single activity metric on the dashboard: a tinted icon chip, a large
// number, and a label. Flat surface, border over shadow, navy/cyan brand
// (CLAUDE.md §2). Clickable when `href` is provided.
export function StatCard({ label, count, icon, chipClassName, href }: StatCardProps) {
  const inner = (
    <>
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-lg',
          chipClassName ?? 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-none text-[var(--color-fg)]">
          {count}
        </div>
        <div className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{label}</div>
      </div>
    </>
  );

  const base =
    'flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4';

  if (!href) {
    return <div className={base}>{inner}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        base,
        'transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-muted)]',
      )}
    >
      {inner}
    </Link>
  );
}
