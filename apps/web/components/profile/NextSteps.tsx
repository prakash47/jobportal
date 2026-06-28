import Link from 'next/link';
import { ArrowRight, Check, Circle } from '@jobportal/ui/icons';
import { CompletenessIndicator } from './CompletenessIndicator';

export interface ProfileStep {
  label: string;
  href: string;
  done: boolean;
}

// Profile-completeness card with a calm "next steps" checklist. Only the
// incomplete steps are surfaced as actionable links; once everything is done the
// card collapses to a single reassuring line. Not a Naukri-style progress-bar
// gimmick (CLAUDE.md §2) — a thin ring + a short list.
export function NextSteps({ score, steps }: { score: number; steps: ProfileStep[] }) {
  const remaining = steps.filter((s) => !s.done);

  return (
    <section
      aria-labelledby="next-steps-heading"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
    >
      <div className="flex items-center gap-4">
        <CompletenessIndicator score={score} />
        <div className="min-w-0">
          <h2 id="next-steps-heading" className="text-base font-semibold text-[var(--color-fg)]">
            {remaining.length === 0 ? 'Your profile is complete' : 'Complete your profile'}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
            {remaining.length === 0
              ? 'Nice work — recruiters see a full picture when you apply.'
              : `${remaining.length} ${remaining.length === 1 ? 'step' : 'steps'} left to stand out to recruiters.`}
          </p>
        </div>
      </div>

      {remaining.length > 0 && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {remaining.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex items-center gap-2.5 rounded-md border border-[var(--color-border)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Circle className="size-4 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
                <span className="text-[var(--color-fg)]">{s.label}</span>
                <ArrowRight
                  className="ml-auto size-4 shrink-0 text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {remaining.length === 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-success)]">
          <Check className="size-4" aria-hidden="true" />
          All sections filled in.
        </p>
      )}
    </section>
  );
}
