import { Sparkles, Zap, ShieldCheck, Search, Bell, Check } from '@jobportal/ui/icons';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

// Bento value grid — merges the old HowItWorks + WhyJobPortal into one
// asymmetric block. ONE large gradient-bordered anchor tile (the headline
// promise) + four smaller bordered tiles. Bold where it counts, calm tiles
// around it. All copy reused from the originals; no fabricated data.

const ANCHOR = {
  icon: Sparkles,
  title: 'No ads. No clutter. Just jobs.',
  body: 'A focused search built for finding work — never for serving you banner ads or sponsored noise. Every screen earns its place, so you spend your energy on the next role, not on dodging the interface.',
  proof: '0 ads, ever',
};

const TILES: ReadonlyArray<{ icon: typeof Zap; title: string; body: string }> = [
  { icon: Zap, title: 'Apply in seconds', body: 'One profile, one click. Track every application from a single dashboard.' },
  { icon: ShieldCheck, title: 'Free, always', body: 'Searching, applying, and alerts stay free for job seekers — no paywalls.' },
  { icon: Search, title: 'Search calmly', body: 'Filter by role, city, and experience. No sponsored results in your way.' },
  { icon: Bell, title: 'Get alerted', body: 'Save a search; we email new matching roles at the cadence you choose.' },
];

export function BentoValue() {
  const Anchor = ANCHOR.icon;
  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Why JobPortal"
        title="A job search that respects your time"
        description="Built for India, designed to stay out of your way."
      />
      <Reveal>
        <div className="grid gap-4 lg:grid-cols-4 lg:grid-rows-2">
          {/* Large gradient-bordered anchor tile */}
          <div className="gradient-border relative overflow-hidden rounded-2xl p-7 sm:p-8 lg:col-span-2 lg:row-span-2">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-70 blur-2xl"
              style={{ background: 'var(--gradient-brand-soft)' }}
            />
            <div className="relative flex h-full flex-col">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]">
                <Anchor className="size-5" aria-hidden="true" />
              </span>
              <span
                className="mt-5 block h-[2px] w-10 rounded-full"
                style={{ background: 'var(--gradient-brand)' }}
                aria-hidden="true"
              />
              <h3 className="mt-5 text-2xl font-bold tracking-tight text-[var(--color-fg)] sm:text-3xl">
                {ANCHOR.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-fg-muted)] sm:text-base">
                {ANCHOR.body}
              </p>
              <p className="mt-auto inline-flex items-center gap-1.5 pt-6 text-xs font-medium text-[var(--color-fg-subtle)]">
                <Check className="size-4 text-[var(--color-success)]" aria-hidden="true" />
                {ANCHOR.proof}
              </p>
            </div>
          </div>

          {/* Four smaller bordered tiles */}
          {TILES.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.title}
                className="card-lift rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-fg-muted)]">{t.body}</p>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
