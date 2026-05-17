import Link from 'next/link';
import { MapPin } from '@jobportal/ui/icons';
import type { PopularItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  cities: PopularItem[];
}

// Tiles link to `/jobs?city=<slug>` (the working SRP with a query filter)
// rather than `/jobs-in-<slug>` SEO landings — those 404 today per
// follow-up chip #5 (Next 16 catch-all bug). Same Elasticsearch result set
// either way; canonical SEO URL swap happens when the catch-all refactor
// lands.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function PopularCitiesGrid({ cities }: Props) {
  if (cities.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Destinations"
        title="Jobs by city"
        description="Pick where you want to work — pre-filtered to active openings."
        cta={{ label: 'All cities', href: '/jobs' }}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cities.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/jobs?city=${encodeURIComponent(c.slug)}`}
              className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]"
            >
              <span className="flex items-center gap-2 truncate">
                <MapPin
                  className="size-4 shrink-0 text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-medium text-[var(--color-fg)]">
                  {c.name}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--color-fg-muted)]">
                {fmt(c.jobCount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
