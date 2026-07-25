'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Soft cap used only to scale the visual bar — not a real ceiling on reach.
const BAR_CAP = 25;

interface ReachMeterProps {
  skillIds: number[];
  cityId: number | '';
  experienceMonths: number | null;
}

// Live "estimated reach" gauge — how many candidates in our pool match the
// skills + location (+ min experience) entered so far. A quiet number + thin
// bar, labelled as an estimate.
export function ReachMeter({ skillIds, cityId, experienceMonths }: ReachMeterProps) {
  const [count, setCount] = useState<number | null>(null);
  const skillKey = skillIds.join(',');
  const hasInputs = skillIds.length > 0 || cityId !== '';

  useEffect(() => {
    if (!hasInputs) {
      setCount(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (skillKey) params.set('skillIds', skillKey);
      if (cityId !== '') params.set('cityId', String(cityId));
      if (experienceMonths !== null) params.set('experienceMonths', String(experienceMonths));
      fetch(`${API_URL}/recruiter/jobs/reach?${params.toString()}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<{ count: number }>) : null))
        .then((d) => setCount(d ? d.count : null))
        .catch(() => {
          /* aborted or network */
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [skillKey, cityId, experienceMonths, hasInputs]);

  const barPct = count === null ? 0 : Math.min(100, Math.max(4, (count / BAR_CAP) * 100));

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">Estimated reach</h3>
      {!hasInputs ? (
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Add key skills or a location to estimate how many candidates you&rsquo;ll reach.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-lg font-semibold tabular-nums text-[var(--color-fg)]">
            {count === null ? '—' : `~${count.toLocaleString('en-IN')}`}{' '}
            <span className="text-xs font-normal text-[var(--color-fg-muted)]">
              matching {count === 1 ? 'candidate' : 'candidates'}
            </span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-success)] transition-[width] duration-300"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Estimate from your candidate pool. Add a salary and more skills to widen reach.
          </p>
        </div>
      )}
    </div>
  );
}
