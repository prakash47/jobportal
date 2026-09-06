// SRS §4.11.16-17 — compact daily-application counter shown in the dashboard
// top bar. Hides entirely when the user is on an unlimited tier (no surface =
// no friction). Server component so the count reflects the latest Redis value
// without a client round-trip.
//
// THE LABEL IS LOAD-BEARING. This used to read just "0/10 today", with the
// noun only in the aria-label — so sighted users got a bare ratio and screen
// reader users got the meaning. A tester looking straight at it reported it as
// a "daily search limit", which is the natural reading: the pill sits in the
// header's ml-auto group, immediately right of the search bar and left of the
// "Find jobs" button, so everything around it is about SEARCH.
//
// Two things make the bare ratio worse than it looks:
//   * "0/10" at the start of a day reads just as easily as "0 remaining out of
//     10" as it does "0 used of 10".
//   * the dashboard body below shows an "Applications: 19" stat card. A user
//     seeing 19 there and 0/10 here has nothing on screen connecting them, and
//     19 > 10 makes the pair look self-contradictory until you know one is
//     lifetime and the other is today.
// Naming the verb fixes both at once.
//
// USED, not remaining, and that is deliberate: the ring FILLS as the count
// grows, and both the at-limit button ("Daily limit reached") and the API's 429
// ("Daily application limit reached") are phrased around the limit being
// consumed. A remaining-style count would run backwards against all three.

import { readApplyQuota } from '../../lib/applications/quota-state';
import { classifyQuota } from '../../lib/applications/quota-ui-state';

export async function DailyApplyIndicator() {
  const quota = await readApplyQuota();
  if (!quota) return null;
  if (quota.unlimited) return null;

  const state = classifyQuota(quota);
  const pct = Math.max(0, Math.min(100, Math.round((quota.count / quota.limit) * 100)));
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const stroke =
    state === 'exhausted'
      ? 'var(--color-danger)'
      : state === 'warning'
        // NOT a bare var(--color-warning), and that is measured rather than
        // fussy. This started as a hardcoded oklch(0.65 0.15 80), which looked
        // like someone ignoring CLAUDE.md §2 — but swapping in the token made
        // the ring FAIL WCAG 1.4.11: canvas-sampled against the pill background
        // (#f9fafb), --color-warning is 1.95:1 where the hardcoded value was
        // 3.15:1, and non-text UI needs 3:1. The literal was contrast-tuned, not
        // careless.
        //
        // Mixing the token toward --color-fg keeps the value token-DERIVED (so
        // it tracks any future brand change) while restoring the contrast:
        // measured 3.72:1 here. It also self-corrects per theme — in dark mode
        // --color-fg is light, so the same expression lightens the amber instead
        // of darkening it, which a fixed literal cannot do. Same house pattern
        // as FormError and ProfilePhotoCard.
        ? 'color-mix(in oklch, var(--color-warning), var(--color-fg) 30%)'
        // Same treatment, found the same way. A bare var(--color-primary-600)
        // is 14.71:1 in light and 1.31:1 in DARK — the brand navy on a near
        // black pill, i.e. an invisible ring for the whole 0-79% normal range,
        // which is most of most days. Mixing toward --color-fg leaves light
        // mode where it was (15.82:1, indistinguishable) and lifts dark to
        // 4.86:1. Candidates measured before choosing: accent-500 fails light
        // (2.83:1), accent-600 passes both but repaints the ring cyan, and a
        // 30% mix clears dark by too little (3.09:1) to be worth the risk.
        : 'color-mix(in oklch, var(--color-primary-600), var(--color-fg) 45%)';

  return (
    // No role="status" and no aria-label, both deliberate. This is persistent
    // chrome rendered by a SERVER component: the value cannot change in place,
    // so a live region could only ever fire on insertion — announcing a static
    // number on every dashboard navigation. And an aria-label here would now
    // compete with the visible text rather than supplement it.
    // Instead the two audiences get their own string: `sr-only` carries the
    // spelled-out sentence (screen readers pronounce "8/10" inconsistently —
    // "eight slash ten"), while the compact visible ratio is aria-hidden.
    <div className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] py-1 pl-1.5 pr-3 sm:flex">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span className="sr-only">
        Applied to {quota.count} of {quota.limit} jobs today
      </span>
      <span
        aria-hidden="true"
        className="text-xs font-medium tabular-nums text-[var(--color-fg-muted)]"
      >
        Applied {quota.count}/{quota.limit} today
      </span>
    </div>
  );
}
