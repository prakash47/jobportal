import Link from 'next/link';
import { Check } from '@jobportal/ui/icons';
import { HeroSearchBar, type HeroCity } from './HeroSearchBar';
import { HeroJobCluster } from './HeroJobCluster';
import type { HeroJob } from '../../lib/home/queries';

interface HeroProps {
  activeJobsCount: number;
  cities: HeroCity[];
  jobs: HeroJob[];
}

// "Confident light studio" hero: an asymmetric split — persuasive copy + a
// glass search console on the left, a floating cluster of REAL job cards on the
// right — over a soft navy→cyan aurora. Brand energy at full strength here,
// quoted as hairlines elsewhere. The H1 stays pure text (the LCP element);
// the aurora is a separate CSS layer; the cluster has a reserved aspect-ratio.

const fmt = (n: number) => n.toLocaleString('en-IN');

const QUICK_FILTERS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Remote', href: '/jobs?mode=remote' },
  { label: 'Fresher', href: '/jobs?expMax=1' },
  { label: 'Bangalore', href: '/jobs?city=bangalore' },
  { label: 'Full Stack', href: '/jobs?q=full+stack' },
  { label: 'Data Science', href: '/jobs?q=data+scientist' },
  { label: 'Product', href: '/jobs?q=product+manager' },
];

const GUARANTEES = ['No ads', 'Free for job seekers', 'No spam alerts'];

export function Hero({ activeJobsCount, cities, jobs }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)] px-4 pt-20 pb-14 sm:px-6 sm:pt-28 lg:pt-32">
      {/* Masked dot-grid — fine texture. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 30% 30%, #000 28%, transparent 76%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 30% 30%, #000 28%, transparent 76%)',
          opacity: 0.5,
        }}
      />
      {/* Aurora mesh — navy+cyan, weighted right; bottom-masked into TrustStrip. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: 'var(--gradient-mesh)',
          maskImage: 'linear-gradient(#000 58%, transparent)',
          WebkitMaskImage: 'linear-gradient(#000 58%, transparent)',
        }}
      />
      {/* One faint cyan focal glow behind the card cluster (1 of ≤3 glows). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[62%] top-[18%] -z-10 size-[34rem] rounded-full bg-[var(--color-accent-500)] opacity-[0.06] blur-[120px]"
      />

      <div className="mx-auto grid max-w-[var(--container-max)] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* LEFT — copy + search */}
        <div>
          <Link
            href="/jobs"
            className="rise inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 shadow-[var(--shadow-card)] backdrop-blur-md transition-colors hover:border-[var(--color-primary-300)]"
          >
            <span className="relative flex size-1.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-accent-500)] opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-accent-500)]" />
            </span>
            <span className="text-xs text-[var(--color-fg-muted)]">
              <span className="font-semibold tabular-nums text-[var(--color-primary-700)]">
                {fmt(activeJobsCount)}
              </span>{' '}
              active roles today
            </span>
          </Link>

          <h1
            className="rise mt-8 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-[var(--color-fg)] sm:text-5xl lg:text-6xl xl:text-7xl"
            style={{ animationDelay: '60ms' }}
          >
            Find work that <span className="gradient-text">fits</span> your life.
          </h1>
          <p
            className="rise mt-5 max-w-xl text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            A calmer way to search jobs across India. No ads, no clutter — just
            openings that match your skills, city, and experience.
          </p>

          <div className="rise mt-8" style={{ animationDelay: '180ms' }}>
            <HeroSearchBar cities={cities} />
          </div>

          <div className="rise" style={{ animationDelay: '240ms' }}>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-fg-subtle)]">Popular:</span>
              {QUICK_FILTERS.map((f) => (
                <Link
                  key={f.label}
                  href={f.href}
                  className="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
                >
                  {f.label}
                </Link>
              ))}
            </div>

            <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-fg-subtle)]">
              {GUARANTEES.map((g) => (
                <li key={g} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-[var(--color-success)]" aria-hidden="true" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT — floating real-job cluster (self-animates; mobile shows one card) */}
        <HeroJobCluster jobs={jobs} />
      </div>
    </section>
  );
}
