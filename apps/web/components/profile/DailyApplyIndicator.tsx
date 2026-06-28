// SRS §4.11.16-17 — compact daily-application counter shown in the dashboard
// top bar. Hides entirely when the user is on an unlimited tier (no surface =
// no friction). Server component so the count reflects the latest Redis value
// without a client round-trip.

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
        ? 'oklch(0.65 0.15 80)'
        : 'var(--color-primary-600)';

  return (
    <div
      className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] py-1 pl-1.5 pr-3 sm:flex"
      role="status"
      aria-label={`Used ${quota.count} of ${quota.limit} applications today`}
    >
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
      <span className="text-xs font-medium tabular-nums text-[var(--color-fg-muted)]">
        {quota.count}/{quota.limit} today
      </span>
    </div>
  );
}
