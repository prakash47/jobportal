import { UserPlus } from '@jobportal/ui/icons';
import type { SignupStats as SignupStatsData } from '../../lib/dashboard/queries';
import { TREND_DAYS } from '../../lib/dashboard/queries';
import { TrendChart } from './TrendChart';

// Brand navy. Charts use theme tokens rather than hardcoded hex so they follow
// the palette and stay correct if the brand shifts (COLLABORATION.md §4.3).
const SIGNUP_COLOR = 'var(--color-primary-600)';

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-fg-muted)]">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          value === 0 ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]'
        }`}
      >
        {value.toLocaleString('en-IN')}
      </dd>
    </div>
  );
}

export function SignupStats({ data }: { data: SignupStatsData }) {
  const { today, last7, last30, candidates30, recruiters30, daily } = data;

  return (
    <section
      aria-labelledby="sadmin-signups-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="sadmin-signups-heading"
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-fg)]"
      >
        <UserPlus className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
        New signups
      </h2>
      {/* Naming the timezone matters: "today" is ambiguous for a team that may
          not sit in the market it serves, and the buckets are IST. */}
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Candidate and recruiter accounts created. Days are IST.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-4">
        <Figure label="Today" value={today} />
        <Figure label="Last 7 days" value={last7} />
        <Figure label={`Last ${TREND_DAYS} days`} value={last30} />
      </dl>

      {/* The split only says something once there is something to split. */}
      {last30 > 0 && (
        <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
          {candidates30.toLocaleString('en-IN')} job seeker
          {candidates30 === 1 ? '' : 's'} · {recruiters30.toLocaleString('en-IN')} recruiter
          {recruiters30 === 1 ? '' : 's'}
        </p>
      )}

      <div className="mt-4">
        <TrendChart
          title={`New signups per day, last ${TREND_DAYS} days`}
          variant="bar"
          height={90}
          emptyMessage={`No new signups in the last ${TREND_DAYS} days.`}
          series={[{ name: 'Signups', points: daily, color: SIGNUP_COLOR }]}
        />
      </div>
    </section>
  );
}
