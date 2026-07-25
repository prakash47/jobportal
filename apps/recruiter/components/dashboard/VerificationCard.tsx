import Link from 'next/link';
import { cn } from '@jobportal/ui';
import { AlertCircle, ArrowRight, Check, Circle, Clock, ShieldCheck } from '@jobportal/ui/icons';
import {
  formatList,
  type VerificationProgress,
  type VerificationStep,
  type VerificationStepState,
} from '../../lib/dashboard/verification';

// The dashboard's lede — where the recruiter stands on getting verified, shown
// above every KPI because an unverified recruiter cannot post a job at all.
//
// Deliberately not a Naukri-style nag: once every step is genuinely done the
// whole card collapses to a single quiet line (CLAUDE.md §2). Progress is led by
// the honest integer "N of M complete"; the bar is secondary decoration.
//
// This card absorbs the dashboard's old standalone work-email banner: step 1
// says the same thing, and keeping both meant an unverified recruiter read the
// identical prompt twice on one screen.

// Foregrounds are darkened to clear WCAG AA (4.5:1) on the light surface, using
// the same local-oklch recipe JobStatusBadge documents — theme.css is a §15
// locked shared surface and is not touched for a single app's card.
const STATE_STYLE: Record<
  VerificationStepState,
  { icon: typeof Check; chip: string; fg: string; srLabel: string }
> = {
  DONE: {
    icon: Check,
    chip: 'border-[oklch(0.52_0.15_145)] text-[oklch(0.52_0.15_145)]',
    fg: 'text-[oklch(0.52_0.15_145)]',
    srLabel: 'Complete',
  },
  IN_REVIEW: {
    icon: Clock,
    chip: 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)]',
    fg: 'text-[var(--color-fg-muted)]',
    srLabel: 'Under review',
  },
  ACTION_NEEDED: {
    icon: AlertCircle,
    chip: 'border-[oklch(0.52_0.20_25)] text-[oklch(0.52_0.20_25)]',
    fg: 'text-[oklch(0.52_0.20_25)]',
    srLabel: 'Action needed',
  },
  TODO: {
    icon: Circle,
    chip: 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)]',
    fg: 'text-[var(--color-fg-muted)]',
    srLabel: 'Not started',
  },
};

export function VerificationCard({ progress }: { progress: VerificationProgress }) {
  // `complete` counts a submitted-but-unreviewed KYC as done from the
  // recruiter's side, which is right for the counter but wrong for a
  // "you're verified" claim — so the collapsed state needs every step DONE.
  const allVerified = progress.steps.every((s) => s.state === 'DONE');

  if (allVerified) {
    // Built from the steps that actually ran, never a fixed sentence: when the
    // KYC killswitch removes step 3 there is no approved company verification
    // to claim, and saying otherwise would be a plain falsehood on screen.
    const summary = formatList(progress.steps.map((s) => s.doneSummary));
    return (
      <section
        aria-labelledby="verification-heading"
        className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4"
      >
        <ShieldCheck
          className="size-5 shrink-0 text-[oklch(0.52_0.15_145)]"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 id="verification-heading" className="text-sm font-semibold text-[var(--color-fg)]">
            Your account is fully verified
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)] first-letter:uppercase">
            {summary}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="verification-heading"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id="verification-heading"
            className="flex items-center gap-2 text-base font-semibold text-[var(--color-fg)]"
          >
            <ShieldCheck className="size-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
            Verification
          </h2>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Finish these steps to post jobs and earn a verified badge on your postings.
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-[var(--color-fg)]">
          {progress.stepsDone} of {progress.stepsTotal} complete
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Verification ${progress.percent}% complete`}
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-muted)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-primary-600)] transition-[width] duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <ol className="mt-5 divide-y divide-[var(--color-border)]">
        {progress.steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ol>
    </section>
  );
}

function StepRow({ step }: { step: VerificationStep }) {
  const style = STATE_STYLE[step.state];
  const Icon = style.icon;
  const showCount = step.total > 1 && step.state !== 'DONE' && step.state !== 'IN_REVIEW';

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          style.chip,
        )}
      >
        {/* The icon is decorative; the visually-hidden text below carries state
            to assistive tech so state is never signalled by colour alone. */}
        <Icon className="size-3" aria-hidden="true" strokeWidth={2.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-[var(--color-fg)]">{step.label}</span>
          <span className="sr-only">— {style.srLabel}</span>
          {showCount && (
            <span className="text-xs tabular-nums text-[var(--color-fg-muted)]">
              {step.done} of {step.total}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{step.description}</p>
        {step.detail && <p className={cn('mt-1 text-sm', style.fg)}>{step.detail}</p>}
      </div>

      {step.href && step.ctaLabel && (
        <Link
          href={step.href}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-[var(--color-primary-700)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          {step.ctaLabel}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}
