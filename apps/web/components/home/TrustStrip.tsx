import { Briefcase, Building2, Users, ShieldCheck } from '@jobportal/ui/icons';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';
import { CountUp } from './CountUp';

interface TrustStripProps {
  activeJobs: number;
  companies: number;
  recruiters: number;
}

// "By the numbers" stats band — a framed section (eyebrow + title) with rich
// glass cards: gradient-soft icon chips, large count-up figures, a label and a
// sublabel. The freemium "₹0" is the featured, gradient-bordered card. Sits on
// a faint cyan wash; cards lift on hover and the numbers count up on scroll.

export function TrustStrip({ activeJobs, companies, recruiters }: TrustStripProps) {
  const stats: ReadonlyArray<{ icon: typeof Briefcase; value: number; label: string; sub: string }> = [
    { icon: Briefcase, value: activeJobs, label: 'Active jobs', sub: 'Open roles right now' },
    { icon: Building2, value: companies, label: 'Companies hiring', sub: 'Across every industry' },
    { icon: Users, value: recruiters, label: 'Hiring teams', sub: 'Verified recruiters' },
  ];

  return (
    <section
      className="relative border-b border-[var(--color-border)] py-16 sm:py-20"
      style={{
        backgroundImage:
          'radial-gradient(55rem 20rem at 50% 0%, color-mix(in oklch, var(--color-accent-500) 5%, transparent), transparent 72%)',
      }}
    >
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="By the numbers"
          title="Opportunity, in real numbers"
          description="Open roles from companies hiring across India — and it's free for job seekers, always."
        />
        <Reveal>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="glass card-lift rounded-2xl p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="mt-4 text-4xl font-bold tracking-tight tabular-nums text-[var(--color-fg)] sm:text-5xl">
                    <CountUp value={s.value} />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--color-fg)]">{s.label}</div>
                  <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{s.sub}</div>
                </div>
              );
            })}

            {/* Featured freemium stat. */}
            <div className="gradient-border card-lift relative overflow-hidden rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[var(--color-accent-500)] opacity-[0.12] blur-2xl"
              />
              <span className="flex size-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="mt-4 text-4xl font-bold tracking-tight text-[var(--color-fg)] sm:text-5xl">₹0</div>
              <div className="mt-1 text-sm font-semibold text-[var(--color-fg)]">For job seekers</div>
              <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">No paywalls, ever</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
