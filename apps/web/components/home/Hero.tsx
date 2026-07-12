import Link from 'next/link';
import { Check } from '@jobportal/ui/icons';
import { HeroSearchBar, type HeroCity } from './HeroSearchBar';

interface HeroProps {
  cities: HeroCity[];
}

// Content-driven hero, top-weighted — the headline + glass search console are
// the whole show, sized to their content (no forced full-viewport height, so no
// empty void below). Light theme, bold display type, PLAIN brand colours only
// (no gradients per brand). A subtle neutral dot texture lives in its own clipped
// layer so the search dropdowns can overflow the section without being cut.

const QUICK_FILTERS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Remote', href: '/jobs?mode=remote' },
  { label: 'Fresher', href: '/jobs?expMax=1' },
  { label: 'Bangalore', href: '/jobs?city=bangalore' },
  { label: 'Full Stack', href: '/jobs?q=full+stack' },
  { label: 'Data Science', href: '/jobs?q=data+scientist' },
  { label: 'Product', href: '/jobs?q=product+manager' },
];

const GUARANTEES = ['No ads', 'Free for job seekers', 'No spam alerts'];

export function Hero({ cities }: HeroProps) {
  return (
    <section className="relative flex flex-col items-center border-b border-[var(--color-border)] px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      {/* Background: a subtle NEUTRAL dot texture only. The navy→cyan gradient
          mesh + cyan aurora glow were removed (brand: flat colours, no gradients).
          Kept separate from the content so search dropdowns overflow uncut. The
          dot pattern is one flat border colour — no colour gradient. */}
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
          Where great <span className="text-[var(--color-accent-600)]">careers</span> begin.
        </h1>
        <p
          className="rise mx-auto mt-6 max-w-3xl text-balance text-lg leading-relaxed text-[var(--color-fg-muted)]"
          style={{ animationDelay: '60ms' }}
        >
          Real jobs, real companies. No ads.
        </p>

        {/* z-30 so the search + its dropdowns sit above the chips/guarantees below. */}
        <div className="rise relative z-30 mt-10" style={{ animationDelay: '120ms' }}>
          <HeroSearchBar cities={cities} />
        </div>

        <div className="rise relative z-10" style={{ animationDelay: '180ms' }}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
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

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-fg-subtle)]">
            {GUARANTEES.map((g) => (
              <li key={g} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-[var(--color-success)]" aria-hidden="true" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
