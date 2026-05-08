'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    description: 'Daily and weekly digests of new jobs matching your saved searches.',
  },
  {
    key: 'applicationStatusEnabled',
    label: 'Application updates',
    description:
      'When a recruiter moves your application forward, rejects it, or you withdraw.',
  },
  {
    key: 'productNewsEnabled',
    label: 'Product news',
    description: 'Occasional announcements about new JobPortal features.',
  },
];

export function NotificationPreferencesForm({
  initial,
}: {
  initial: NotificationPreferences;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences>(initial);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    prefs.jobAlertsEnabled !== initial.jobAlertsEnabled ||
    prefs.applicationStatusEnabled !== initial.applicationStatusEnabled ||
    prefs.productNewsEnabled !== initial.productNewsEnabled;

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSavedAt(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/me/notifications`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {CHANNELS.map((c) => {
        const checked = prefs[c.key];
        return (
          <label
            key={c.key}
            className="flex cursor-pointer items-start justify-between gap-6 rounded-md border border-[var(--color-border)] p-4 transition-colors hover:border-[var(--color-border-strong)]"
          >
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
        );
      })}

      <div className="flex items-center justify-between pt-6">
        <div className="min-h-[20px] text-sm">
          {error ? (
            <span className="text-[var(--color-danger)]">{error}</span>
          ) : savedAt ? (
            <span className="text-[var(--color-fg-muted)]">Saved.</span>
          ) : null}
        </div>
        <Button
          variant="primary"
          onClick={save}
          loading={busy || pending}
          disabled={!dirty}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
