import { ShieldCheck, Zap, Sparkles, Check } from '@jobportal/ui/icons';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

// Three-column value-proposition grid — a calm, honest replacement for the
// testimonial carousels Naukri leans on. Brand-tinted icon chip, the shared
// cyan hairline motif under each chip, and one freemium proof line per card.

const USPS: ReadonlyArray<{
  icon: typeof ShieldCheck;
  title: string;
  body: string;
  proof: string;
}> = [
  {
    icon: Sparkles,
    title: 'No ads, no clutter',
    body: 'A focused search built for finding jobs — not for serving you banner ads. Every screen earns its place.',
    proof: '0 ads, ever',
  },
  {
    icon: Zap,
    title: 'Apply in seconds',
    body: 'One profile, one click. Track every application from a single dashboard and never lose where you stand.',
    proof: 'Apply in under 30s',
  },
  {
    icon: ShieldCheck,
    title: 'Free to use, always',
    body: 'Searching, applying, and job alerts are free for job seekers. No paywalls between you and your next role.',
    proof: '₹0, forever',
  },
];

export function WhyJobPortal() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Why JobPortal"
        title="A job search that respects your time"
        description="Built for India, designed to stay out of your way."
      />
      <Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {USPS.map((u) => {
            const Icon = u.icon;
            return (
              <div
                key={u.title}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-7 transition-colors hover:border-[var(--color-border-strong)]"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="mt-4 block h-px w-8 bg-[var(--color-accent-500)]" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">{u.body}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-subtle)]">
                  <Check className="size-3.5 text-[var(--color-success)]" aria-hidden="true" />
                  {u.proof}
                </p>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
