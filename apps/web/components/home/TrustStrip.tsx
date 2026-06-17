import { Briefcase, Building2, Users, ShieldCheck } from '@jobportal/ui/icons';
import { Reveal } from './Reveal';

interface TrustStripProps {
  activeJobs: number;
  companies: number;
  recruiters: number;
}

// Four floating glass stat cards — the quantitative masthead. Audited tabular
// figures (no count-up), gradient-soft icon chips, and one faint cyan corner
// glow on the freemium "₹0" card. SSR numbers, en-IN grouping.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function TrustStrip({ activeJobs, companies, recruiters }: TrustStripProps) {
  const stats: ReadonlyArray<{ value: string; label: string; icon: typeof Briefcase; glow?: boolean }> = [
    { value: fmt(activeJobs), label: 'Active jobs', icon: Briefcase },
    { value: fmt(companies), label: 'Companies hiring', icon: Building2 },
    { value: fmt(recruiters), label: 'Hiring teams', icon: Users },
    { value: '₹0', label: 'For job seekers', icon: ShieldCheck, glow: true },
  ];

  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="glass card-lift relative overflow-hidden rounded-xl p-6 text-center"
              >
                {s.glow && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-[var(--color-accent-500)] opacity-[0.10] blur-2xl"
                  />
                )}
                <span className="mx-auto mb-3 flex size-9 items-center justify-center rounded-md bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="text-3xl font-bold tracking-tight tabular-nums text-[var(--color-fg)] sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
