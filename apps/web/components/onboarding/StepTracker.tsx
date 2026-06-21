import { Check } from '@jobportal/ui/icons';
import { cn } from '@jobportal/ui';

export type TrackerStatus = 'done' | 'active' | 'upcoming';
export interface TrackerStep {
  label: string;
  desc: string;
  status: TrackerStatus;
}

// Vertical onboarding progress rail (desktop only). A connected timeline of
// circles: navy filled + check for done, a cyan-haloed ring for the active step,
// hairline outline for what's ahead. Flat brand — no gradients, no shadows.
export function StepTracker({ title, steps }: { title: string; steps: TrackerStep[] }) {
  return (
    <nav aria-label="Onboarding progress" className="sticky top-20">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
        {title}
      </p>
      <ol className="mt-6">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={s.label} className="relative flex gap-4 pb-7 last:pb-0">
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[17px] top-9 bottom-0 w-0.5 rounded-full',
                    s.status === 'done' ? 'bg-[var(--color-primary-600)]' : 'bg-[var(--color-border)]',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  s.status === 'done' && 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white',
                  s.status === 'active' &&
                    'border-[var(--color-accent-500)] bg-[var(--color-bg-elevated)] text-[var(--color-primary-700)] ring-4 ring-[var(--color-accent-100)]',
                  s.status === 'upcoming' &&
                    'border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]',
                )}
                aria-hidden="true"
              >
                {s.status === 'done' ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="pt-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    s.status === 'upcoming' ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]',
                  )}
                >
                  {s.label}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-xs',
                    s.status === 'active' ? 'text-[var(--color-primary-700)]' : 'text-[var(--color-fg-muted)]',
                  )}
                >
                  {s.status === 'done' ? 'Completed' : s.status === 'active' ? 'In progress' : s.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
