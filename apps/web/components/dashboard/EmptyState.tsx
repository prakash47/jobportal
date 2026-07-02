import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';

export interface EmptyStateProps {
  /** A lucide icon element, e.g. <Bookmark className="size-5" />. */
  icon: ReactNode;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}

// Shared empty state for the dashboard lists: calm icon chip + short copy +
// one optional CTA. Dashed border marks "nothing here yet" apart from real
// content cards.
export function EmptyState({ icon, title, body, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-12 text-center">
      <span
        className="flex size-10 items-center justify-center rounded-full bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="mt-4 text-sm font-medium text-[var(--color-fg)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--color-fg-muted)]">{body}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-600)] hover:underline"
        >
          {cta.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
