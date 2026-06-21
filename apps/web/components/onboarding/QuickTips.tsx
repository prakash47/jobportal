import { Check, Sparkles } from '@jobportal/ui/icons';

// A short, contextual tip per data step — keeps the seeker oriented without
// cluttering the form. Indexed by the wizard's current step (clamped).
const TIPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Skills get you found',
    body: 'Recruiters filter candidates by skills more than anything else. Add the ones you want to be hired for — the custom ones you type count too.',
  },
  {
    title: 'Most recent first',
    body: 'Lead with your latest qualification. It’s the fastest way for a recruiter to place your background at a glance.',
  },
  {
    title: 'Your headline matters most',
    body: 'It’s the first line a recruiter reads. Open with your role and years of experience for the strongest first impression.',
  },
];

const BENEFITS: readonly string[] = [
  'Show up in recruiter searches',
  'Get matched to relevant roles',
  'Apply to jobs in one click',
];

// Right-rail quick-tip + benefits panel (desktop only). Sticky so it stays with
// the seeker as a tall step scrolls. Flat brand — no gradients or shadows.
export function QuickTips({ step }: { step: number }) {
  const idx = Math.min(Math.max(step, 0), TIPS.length - 1);
  const tip = TIPS[idx];
  if (!tip) return null;

  return (
    <div className="sticky top-20 space-y-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-accent-50)] text-[var(--color-accent-700)]">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Quick tip
          </p>
        </div>
        <h2 className="mt-3.5 text-sm font-semibold text-[var(--color-fg)]">{tip.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-fg-muted)]">{tip.body}</p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <p className="text-sm font-semibold text-[var(--color-fg)]">A complete profile helps you</p>
        <ul className="mt-3 space-y-2.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-600)] text-white">
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="text-sm text-[var(--color-fg-muted)]">{b}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-fg-muted)]">
          Takes about a minute — you can edit anything later.
        </p>
      </div>
    </div>
  );
}
