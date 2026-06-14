import Link from 'next/link';
import { Building2 } from '@jobportal/ui/icons';
import type { IndustryItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  industries: IndustryItem[];
}

// Industry tiles link to the SRP industry filter (?industry=<slug>), which the
// Elasticsearch layer already supports via the indexed `industrySlug` term.
// Structural inspiration from Naukri's "Top companies hiring now" vertical grid
// — but calm, monochrome, with a single brand-tinted hover.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function IndustriesGrid({ industries }: Props) {
  if (industries.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Industries"
        title="Explore by industry"
        description="Jump straight to active roles in the sector you want to work in."
        cta={{ label: 'All jobs', href: '/jobs' }}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {industries.map((i) => (
          <li key={i.slug}>
            <Link
              href={`/jobs?industry=${encodeURIComponent(i.slug)}`}
              className="group flex h-full items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--color-fg)]">
                  {i.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                  {fmt(i.jobCount)} {i.jobCount === 1 ? 'opening' : 'openings'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
