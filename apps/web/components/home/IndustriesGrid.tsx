import Link from 'next/link';
import { Building2, ChevronRight } from '@jobportal/ui/icons';
import type { IndustryItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

interface Props {
  industries: IndustryItem[];
}

// Browse-grid card system (shared look with Roles + Cities): gradient-soft icon
// chip, soft navy rest-shadow, hover-lift, and a chevron that slides in.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function IndustriesGrid({ industries }: Props) {
  if (industries.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionHeading
          eyebrow="Industries"
          title="Explore by industry"
          description="Jump straight to active roles in the sector you want to work in."
          cta={{ label: 'All jobs', href: '/jobs' }}
        />
        <Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {industries.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/jobs?industry=${encodeURIComponent(i.slug)}`}
                  className="group flex h-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-primary-300)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                    <Building2 className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--color-fg)]">
                      {i.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                      <span className="tabular-nums">{fmt(i.jobCount)}</span>{' '}
                      {i.jobCount === 1 ? 'opening' : 'openings'}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 self-center -translate-x-1 text-[var(--color-fg-subtle)] opacity-0 transition-all duration-[var(--duration-fast)] group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
