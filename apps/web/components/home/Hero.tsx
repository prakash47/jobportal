import Link from 'next/link';
import { HeroSearchBar, type HeroCity } from './HeroSearchBar';
import { CountUp } from './CountUp';

interface HeroProps {
  cities: HeroCity[];
  counts: { activeJobs: number; companies: number; recruiters: number };
}

// Search-first hero, top-weighted — the headline + search console are the whole
// show, sized to their content (no forced full-viewport height). A slim live
// count ribbon sits right under the search as instant, real scale proof
// (folding in what the standalone stats band used to carry). Light theme, bold
// display type, FLAT brand colours only — no gradients, no glass (CLAUDE.md §2).
// A subtle neutral dot texture lives in its own clipped layer so the search
// dropdowns can overflow the section without being cut.

const QUICK_FILTERS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Remote', href: '/jobs?mode=remote' },
  { label: 'Fresher', href: '/jobs?expMax=1' },
  { label: 'Bangalore', href: '/jobs?city=bangalore' },
  { label: 'Full Stack', href: '/jobs?q=full+stack' },
  { label: 'Data Science', href: '/jobs?q=data+scientist' },
  { label: 'Product', href: '/jobs?q=product+manager' },
];

export function Hero({ cities, counts }: HeroProps) {
  const stats: ReadonlyArray<{ value: number; label: string }> = [
    { value: counts.activeJobs, label: 'active jobs' },
    { value: counts.companies, label: 'companies' },
    { value: counts.recruiters, label: 'hiring teams' },
  ];

  return (
    <section className="relative flex flex-col items-center border-b border-[var(--color-border)] px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      {/* Background: a subtle NEUTRAL dot texture only — flat, no colour
          gradient. Clipped so the search dropdowns overflow uncut. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 62% 52% at 50% 30%, #000 24%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse 62% 52% at 50% 30%, #000 24%, transparent 72%)',
            opacity: 0.45,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl text-center">
        <h1 className="rise text-balance text-3xl font-bold leading-[1.08] tracking-[-0.02em] text-[var(--color-fg)] sm:text-4xl lg:text-5xl">
          Find your next <span className="text-[var(--color-accent-600)]">job</span> in India.
        </h1>
        <p
          className="rise mx-auto mt-6 max-w-3xl text-balance text-lg leading-relaxed text-[var(--color-fg-muted)]"
          style={{ animationDelay: '60ms' }}
        >
          Openings that match your skills, city, and experience — no ads, no clutter.
        </p>

        {/* z-30 so the search + its dropdowns sit above the ribbon/chips below. */}
        <div className="rise relative z-30 mt-10" style={{ animationDelay: '120ms' }}>
          <HeroSearchBar cities={cities} />
        </div>

        <div className="rise relative z-10" style={{ animationDelay: '180ms' }}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-[var(--color-fg-muted)]">Popular:</span>
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

          {/* Live count ribbon — real scale proof right under the search.
              Reads as running text ("12,345 active jobs · … · Free for job
              seekers") to assistive tech. */}
          <p className="mx-auto mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-[var(--color-fg-muted)] sm:gap-x-5">
            {stats.map((s, i) => (
              <span key={s.label} className="inline-flex items-center gap-x-3 sm:gap-x-5">
                {i > 0 && (
                  <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">
                    ·
                  </span>
                )}
                <span className="inline-flex items-baseline gap-1.5">
                  <CountUp
                    value={s.value}
                    className="font-semibold tabular-nums text-[var(--color-fg)]"
                  />
                  <span>{s.label}</span>
                </span>
              </span>
            ))}
            <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">
              ·
            </span>
            <span className="font-medium text-[var(--color-accent-700)]">Free for job seekers</span>
          </p>
        </div>
      </div>
    </section>
  );
}
