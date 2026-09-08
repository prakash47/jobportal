'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, cn } from '@jobportal/ui';
import { apiFetch } from '../../lib/api/fetch';
import { FREQUENCIES, type Frequency } from '../../lib/alerts/query';

export interface NotificationPreferences {
  jobAlertsEnabled: boolean;
  applicationStatusEnabled: boolean;
  productNewsEnabled: boolean;
}

interface Channel {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}

// SRS §4.13.4 — three category toggles. Order is by user-facing relevance:
// the alerts the user opted into first (job alerts) at the top, then the
// transactional cluster, then the empty-set marketing toggle that exists
// for future-proofing the marketing surface.
const CHANNELS: Channel[] = [
  {
    key: 'jobAlertsEnabled',
    label: 'Job alerts',
    description: 'Digests of new jobs matching your saved searches.',
  },
  {
    key: 'applicationStatusEnabled',
    label: 'Application updates',
    description: 'When a recruiter moves your application forward, rejects it, or you withdraw.',
  },
  {
    key: 'productNewsEnabled',
    label: 'Product news',
    // The product is Career Queue. "JobPortal" is the repository name and was
    // never a name a user should see.
    description: 'Occasional announcements about new Career Queue features.',
  },
];

export interface AlertSummary {
  id: number;
  frequency: string;
}

export function NotificationPreferencesForm({
  initial,
  alerts,
}: {
  initial: NotificationPreferences;
  alerts: AlertSummary[];
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences>(initial);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // The cadence shown is the one every alert shares; alerts set individually
  // show as "Mixed" rather than being silently misreported as one of them.
  const initialFrequency = useMemo<Frequency | 'mixed' | null>(() => {
    if (alerts.length === 0) return null;
    const first = alerts[0]!.frequency;
    return alerts.every((a) => a.frequency === first) ? (first as Frequency) : 'mixed';
  }, [alerts]);
  const [frequency, setFrequency] = useState<Frequency | 'mixed' | null>(initialFrequency);

  const prefsDirty =
    prefs.jobAlertsEnabled !== initial.jobAlertsEnabled ||
    prefs.applicationStatusEnabled !== initial.applicationStatusEnabled ||
    prefs.productNewsEnabled !== initial.productNewsEnabled;
  const frequencyDirty = frequency !== initialFrequency && frequency !== 'mixed';
  const dirty = prefsDirty || frequencyDirty;

  const allOff =
    !prefs.jobAlertsEnabled && !prefs.applicationStatusEnabled && !prefs.productNewsEnabled;

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSavedAt(null);
    setError(null);
  }

  function setAll(value: boolean) {
    setPrefs({
      jobAlertsEnabled: value,
      applicationStatusEnabled: value,
      productNewsEnabled: value,
    });
    setSavedAt(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/me/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      // Applying the cadence means writing every alert, because frequency lives
      // on JobAlert and not on the preference row. Done sequentially: ten
      // parallel PATCHes against a rotating-refresh-token session is exactly
      // the concurrency apiFetch's single-flight guard exists to survive, and
      // there is no reason to lean on it here.
      // `frequencyDirty` already excludes 'mixed', and TS narrows through the
      // aliased condition — so re-checking it here is a type error, not caution.
      if (frequencyDirty && frequency !== null) {
        for (const alert of alerts) {
          if (alert.frequency === frequency) continue;
          const patch = await apiFetch(`/me/alerts/${alert.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frequency }),
          });
          if (!patch.ok) throw new Error(`Could not update one of your alerts (${patch.status})`);
        }
      }

      setSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {CHANNELS.map((c) => {
        const checked = prefs[c.key];
        return (
          <div key={c.key}>
            <label className="flex cursor-pointer items-start justify-between gap-6 rounded-md border border-[var(--color-border)] p-4 transition-colors hover:border-[var(--color-border-strong)]">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--color-fg)]">{c.label}</div>
                <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{c.description}</p>
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-checked={checked}
                checked={checked}
                onChange={() => toggle(c.key)}
                className="mt-1 h-4 w-4 cursor-pointer"
              />
            </label>

            {/* Cadence, nested under Job alerts because it only means anything
                while they are on. It writes JobAlert.frequency for every alert
                — the same field the per-alert control on /alerts edits, so the
                two cannot disagree. */}
            {c.key === 'jobAlertsEnabled' && checked && (
              <div className="ml-4 mt-2 space-y-3 border-l-2 border-[var(--color-border)] pl-4">
                {alerts.length === 0 ? (
                  <p className="text-sm text-[var(--color-fg-muted)]">
                    You have no job alerts yet.{' '}
                    <Link
                      href="/alerts"
                      className="font-medium text-[var(--color-primary-600)] underline underline-offset-2"
                    >
                      Create one
                    </Link>{' '}
                    and its cadence will show here.
                  </p>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-[var(--color-fg)]">
                      How often, across all {alerts.length}{' '}
                      {alerts.length === 1 ? 'alert' : 'alerts'}
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {FREQUENCIES.map((f) => {
                        const selected = frequency === f.value;
                        return (
                          <button
                            key={f.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setFrequency(f.value);
                              setSavedAt(null);
                            }}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-left transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                              selected
                                ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
                                : 'border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]',
                            )}
                          >
                            <span
                              className={cn(
                                'block text-sm font-medium',
                                selected
                                  ? 'text-[var(--color-primary-700)]'
                                  : 'text-[var(--color-fg)]',
                              )}
                            >
                              {f.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                              {f.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {frequency === 'mixed' && (
                      <p className="text-xs text-[var(--color-fg-muted)]">
                        Your alerts currently use different cadences. Picking one here applies it to
                        all of them; to keep them different, set each one on the{' '}
                        <Link
                          href="/alerts"
                          className="font-medium text-[var(--color-primary-600)] underline underline-offset-2"
                        >
                          Job alerts
                        </Link>{' '}
                        page.
                      </p>
                    )}
                    {/* Email is the only delivery channel that exists. An
                        Email/Push choice would be a control with nothing behind
                        it — there is no push subscription, service worker or
                        sender anywhere in the product. */}
                    <p className="text-xs text-[var(--color-fg-subtle)]">
                      Delivered by email. Push notifications aren&rsquo;t available yet.
                    </p>
                  </fieldset>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Master opt-out. Previously the only way to stop everything was to
          uncheck each switch in turn. */}
      <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--color-fg)]">
              Unsubscribe from all non-essential emails
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
              Turns off every switch above at once. Account emails — verification, password reset
              and receipts — are always sent, and this does not change that.
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Unsubscribe from all non-essential emails"
            aria-checked={allOff}
            checked={allOff}
            onChange={() => setAll(allOff ? true : false)}
            className="mt-1 h-4 w-4 cursor-pointer"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-6">
        <div className="min-h-[20px] text-sm">
          {error ? (
            <span role="alert" className="text-[var(--color-danger)]">
              {error}
            </span>
          ) : savedAt ? (
            <span className="text-[var(--color-fg-muted)]">Saved.</span>
          ) : null}
        </div>
        <Button variant="primary" onClick={save} loading={busy || pending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}
