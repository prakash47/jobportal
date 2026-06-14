import Link from 'next/link';
import { HeroSearchBar, type HeroCity } from './HeroSearchBar';

interface HeroProps {
  activeJobsCount: number;
  cities: HeroCity[];
}

// Linear/Stripe-style hero: oversized restrained type, a single bordered
// search surface, and one row of quick-filter chips. The live "X active roles
// today" pill (with an accent pulse) is a quiet trust signal — the number is
// real (SSR), not a marketing claim. No gradients, no illustration.

const fmt = (n: number) => n.toLocaleString('en-IN');

// One-tap entry points into the SRP. Structural inspiration from Naukri's
// chip strip; kept to six so the row stays calm.
const QUICK_FILTERS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Remote', href: '/jobs?mode=remote' },
  { label: 'Fresher', href: '/jobs?expMax=1' },
  { label: 'Bangalore', href: '/jobs?city=bangalore' },
  { label: 'Full Stack', href: '/jobs?q=full+stack' },
  { label: 'Data Science', href: '/jobs?q=data+scientist' },
  { label: 'Product', href: '/jobs?q=product+manager' },
];

export function Hero({ activeJobsCount, cities }: HeroProps) {
  return (
    <section className="px-4 pt-20 pb-12 sm:px-6 sm:pt-28 sm:pb-16 lg:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] px-3 py-1">
          <span className="relative flex size-1.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-accent-500)] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-accent-500)]" />
          </span>
          <span className="text-xs font-medium text-[var(--color-primary-700)]">
            {fmt(activeJobsCount)} active roles today
          </span>
        </div>

        <h1 className="text-balance text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-6xl">
          Find work that fits your life.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
          A calmer way to search jobs across India. No ads, no clutter — just
          openings that match your skills, city, and experience.
        </p>

        <div className="mt-10">
          <HeroSearchBar cities={cities} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-[var(--color-fg-subtle)]">Popular:</span>
          {QUICK_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.href}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
