import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';

// Shared chrome for both mega-panels: the top strip (label + live count on the
// left, quick-view pills + Browse-all on the right) and the pill styling. Kept
// here so the Jobs and Companies panels read as one system.

export const navPillClass =
  'inline-flex h-[30px] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[12.5px] font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-primary-300)] hover:text-[var(--color-primary-700)]';

export function MenuStrip({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
      {lead}
      <span className="flex-1" />
      {children}
    </div>
  );
}

export function BrowseAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-primary-600)]"
    >
      {label}
      <ArrowRight
        aria-hidden="true"
        className="size-[15px] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover:translate-x-[3px]"
      />
    </Link>
  );
}
