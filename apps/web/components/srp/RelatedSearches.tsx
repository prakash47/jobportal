import Link from 'next/link';
import { EmptyState } from '@jobportal/ui';
import { Search } from '@jobportal/ui/icons';

const SEED_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Jobs in Bangalore', href: '/jobs-in-bangalore' },
  { label: 'Python jobs', href: '/python-jobs' },
  { label: 'React jobs', href: '/react-jobs' },
  { label: 'Jobs in Mumbai', href: '/jobs-in-mumbai' },
  { label: 'Java jobs', href: '/java-jobs' },
  { label: 'Jobs in Pune', href: '/jobs-in-pune' },
  { label: 'NodeJS jobs', href: '/nodejs-jobs' },
  { label: 'Data Scientist jobs', href: '/data-scientist-jobs' },
];

// FR-4.1.9 — empty results SHALL show a helpful message + related searches.
// MVP: hard-coded popular landings. Replace with click-frequency-driven list
// when telemetry lands (feature/observability).
export function RelatedSearches() {
  return (
    <EmptyState
      icon={<Search className="size-8" aria-hidden="true" />}
      title="No jobs match these filters"
      description="Try removing a filter, broadening the location, or browsing one of these popular searches."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {SEED_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      }
    />
  );
}
