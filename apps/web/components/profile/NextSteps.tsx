import Link from 'next/link';
import { ArrowRight, Check, Circle } from '@jobportal/ui/icons';
import { CompletenessIndicator } from './CompletenessIndicator';
import type { CompletenessStep } from '../../lib/profile/completeness-links';

// Profile-completeness card: the percentage and the checklist that explains it.
//
// These used to be two independent inputs — a `score` prop from the API's
// 14-field weighting table, and a `steps` prop the dashboard page hand-wrote
// with 5 entries. Nothing forced them to agree, and they didn't: finishing all
// five left 55 points unaccounted for, so the card said "All sections filled in"
// while the ring read 94%.
//
// Now there is ONE input. The component takes only the breakdown and derives
// the percentage from it, so a caller cannot hand it a number that disagrees
// with the list — which is exactly what happened when this took a separate
// `score` prop: the dashboard passed the STORED Candidate.profileCompleteness
// column, which had drifted 14 points stale — it showed "75% complete" above a
// list worth 39 more. (The column is recomputed on several writes, not just a
// profile PATCH — education and experience writes call recomputeCompleteness too
// — but nothing recomputes it on READ, so a row seeded or migrated into place
// simply stays wrong until the user happens to edit something.)
export function NextSteps({ steps }: { steps: CompletenessStep[] }) {
  const score = steps.reduce((n, s) => n + s.earned, 0);
  const remaining = steps.filter((s) => !s.done);
  // `steps.length > 0` guards the degenerate case: an empty breakdown would
  // otherwise satisfy `remaining.length === 0` and render "Your profile is
  // complete" beside a 0% ring — the same class of lie this change exists to fix.
  const complete = steps.length > 0 && remaining.length === 0;
  // Sorted by weight so the fastest route to a higher number is at the top —
  // "what do I do next" is the question the card exists to answer.
  const ranked = [...remaining].sort((a, b) => b.points - a.points);
  const pointsAvailable = remaining.reduce((n, s) => n + (s.points - s.earned), 0);

  return (
    <section
      aria-labelledby="next-steps-heading"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
    >
      <div className="flex items-center gap-4">
        <CompletenessIndicator score={score} />
        <div className="min-w-0">
          <h2 id="next-steps-heading" className="text-base font-semibold text-[var(--color-fg)]">
            {complete ? 'Your profile is complete' : 'Complete your profile'}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
            {complete
              ? 'Nice work — recruiters see a full picture when you apply.'
              : `${remaining.length} ${remaining.length === 1 ? 'item' : 'items'} left — worth ${pointsAvailable}% more.`}
          </p>
        </div>
      </div>

      {!complete && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {ranked.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="group flex items-center gap-2.5 rounded-md border border-[var(--color-border)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Circle
                  className="size-4 shrink-0 text-[var(--color-fg-muted)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate text-[var(--color-fg)]">{s.label}</span>
                {/*
                  The weight, so the seeker can see WHY they are at 94 and which
                  single item closes the gap. `earned < points` only for skills,
                  which pays partial credit — showing the remainder rather than
                  the full weight keeps the numbers adding up to the ring.
                */}
                <span className="ml-auto shrink-0 tabular-nums text-xs text-[var(--color-fg-muted)]">
                  +{s.points - s.earned}%
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-[var(--color-fg-muted)] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {complete && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-success)]">
          <Check className="size-4" aria-hidden="true" />
          All sections filled in.
        </p>
      )}
    </section>
  );
}
