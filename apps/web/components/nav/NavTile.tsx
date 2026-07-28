import Link from 'next/link';
import type { ComponentType } from 'react';
import { ChevronRight } from '@jobportal/ui/icons';

// The shared browse-grid tile, compacted for the mega-menu: a navy icon chip,
// a label, an optional live count, and the RolesGrid chevron that slides in on
// hover. Reuses the exact home-grid visual language so the menu reads as a
// native part of the product, not a bolted-on dropdown.

const fmt = (n: number): string => n.toLocaleString('en-IN');

interface NavTileProps {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  noun?: string;
}

export function NavTile({ href, icon: Icon, label, count, noun = 'job' }: NavTileProps) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 pr-7 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-primary-300)]"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--color-fg)]">{label}</span>
        {count !== undefined && (
          <span className="mt-px block text-[11.5px] tabular-nums text-[var(--color-fg-muted)]">
            {fmt(count)} {noun}
            {count === 1 ? '' : 's'}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 -translate-x-1 text-[var(--color-accent-500)] opacity-0 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
      />
    </Link>
  );
}
