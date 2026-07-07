import Link from 'next/link';
import { cn } from '@jobportal/ui';
import { TrendingUp } from '@jobportal/ui/icons';

// One-tap popular searches → the established SEO landing pages (same targets the
// empty-state RelatedSearches uses). A calm shortcut for the most common
// intents, not Naukri-style clutter. Chips wrap on narrow screens.
const POPULAR: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'React', href: '/react-jobs' },
  { label: 'Python', href: '/python-jobs' },
  { label: 'Node.js', href: '/nodejs-jobs' },
  { label: 'Data Scientist', href: '/data-scientist-jobs' },
  { label: 'Bangalore', href: '/jobs-in-bangalore' },
  { label: 'Mumbai', href: '/jobs-in-mumbai' },
];

export function QuickSearches({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-fg-muted)]">
        <TrendingUp className="size-3.5" aria-hidden="true" />
        Popular
      </span>
      {POPULAR.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
