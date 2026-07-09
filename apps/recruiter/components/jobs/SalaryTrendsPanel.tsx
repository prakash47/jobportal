'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Trends {
  count: number;
  minLpa: number;
  medianLpa: number;
  maxLpa: number;
}

// Live "Salary trends" reference panel — benchmarks the role from our own live
// postings, refreshing (debounced) as the title/city change. An estimate, and
// honest about thin data.
export function SalaryTrendsPanel({ title, cityId }: { title: string; cityId: number | '' }) {
  const [data, setData] = useState<Trends | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    const t = title.trim();
    if (t.length < 3) {
      setData(null);
      setState('idle');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState('loading');
      const params = new URLSearchParams({ title: t });
      if (cityId !== '') params.set('cityId', String(cityId));
      fetch(`${API_URL}/recruiter/jobs/salary-trends?${params.toString()}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<Trends | null>) : null))
        .then((d) => {
          setData(d);
          setState('done');
        })
        .catch(() => {
          /* aborted or network — leave prior state */
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [title, cityId]);

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">Salary trends</h3>
      {title.trim().length < 3 ? (
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Enter a job title to see market salary for the role.
        </p>
      ) : state === 'loading' && !data ? (
        <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">Checking market data…</p>
      ) : data ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-[var(--color-fg-muted)]">Median</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--color-fg)]">
                ₹{data.medianLpa} LPA
              </p>
            </div>
            <p className="text-xs tabular-nums text-[var(--color-fg-muted)]">
              ₹{data.minLpa}–{data.maxLpa} LPA
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary-600)]"
              style={{
                marginLeft: `${pct(data.minLpa, data.maxLpa, data.minLpa)}%`,
                width: `${Math.max(6, pct(data.minLpa, data.maxLpa, data.medianLpa))}%`,
              }}
            />
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Based on {data.count} live {data.count === 1 ? 'job' : 'jobs'}
            {cityId !== '' ? ' in this city' : ''}. Estimate.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Not enough market data for this role yet.
        </p>
      )}
    </div>
  );
}

function pct(min: number, max: number, v: number): number {
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}
