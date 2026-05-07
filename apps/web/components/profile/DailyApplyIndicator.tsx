// SRS §4.11.16-17 — small calm counter shown below the profile nav rail.
// Hides when the user is on an unlimited tier (no surface = no friction).
// Renders on the server so the count reflects the latest Redis value
// without a client round-trip.

import { readApplyQuota } from '../../lib/applications/quota-state';
import { classifyQuota } from '../../lib/applications/quota-ui-state';

export async function DailyApplyIndicator() {
  const quota = await readApplyQuota();
  if (!quota) return null;
  if (quota.unlimited) return null;

  const state = classifyQuota(quota);
  const pct = Math.max(0, Math.min(100, Math.round((quota.count / quota.limit) * 100)));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const stroke =
    state === 'exhausted'
      ? 'var(--color-danger)'
      : state === 'warning'
        ? 'oklch(0.65 0.15 80)'
        : 'var(--color-primary-600)';

  return (
    <div
      className="mt-6 flex items-center gap-3 border-t border-[var(--color-border)] pt-4"
      role="status"
      aria-label={`Used ${quota.count} of ${quota.limit} applications today`}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="2" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-sm font-semibold tabular-nums text-[var(--color-fg)]">
          {quota.count}/{quota.limit}
        </span>
        <span className="text-xs text-[var(--color-fg-muted)]">applies today</span>
      </div>
    </div>
  );
}
