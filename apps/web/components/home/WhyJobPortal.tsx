import { ShieldCheck, Zap, Sparkles } from '@jobportal/ui/icons';
import { SectionHeading } from './SectionHeading';

// Three-column value-proposition grid — a calm, honest replacement for the
// testimonial carousels and award badges Naukri leans on. Borders over
// shadows, brand-tinted icon chip, no marketing fluff.

const USPS: ReadonlyArray<{ icon: typeof ShieldCheck; title: string; body: string }> = [
  {
    icon: Sparkles,
    title: 'No ads, no clutter',
    body: 'A focused search built for finding jobs — not for serving you banner ads. Every screen earns its place.',
  },
  {
    icon: Zap,
    title: 'Apply in seconds',
    body: 'One profile, one click. Track every application from a single dashboard and never lose where you stand.',
  },
  {
    icon: ShieldCheck,
    title: 'Free to use, always',
    body: 'Searching, applying, and job alerts are free for job seekers. No paywalls between you and your next role.',
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {USPS.map((u) => {
          const Icon = u.icon;
          return (
            <div
              key={u.title}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">{u.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">{u.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
