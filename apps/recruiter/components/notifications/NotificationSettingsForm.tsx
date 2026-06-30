'use client';

import { useId, useState } from 'react';
import { Switch } from '@jobportal/ui';
import { api } from '../../lib/api-client';

export interface NotificationPrefsInitial {
  emailEnabled: boolean;
  smsEnabled: boolean;
}

type Channel = 'email' | 'sms';

// Recruiter notification channel toggles. Each switch auto-saves on change
// (optimistic; reverts on error) so there is no separate Save button — matches
// the lightweight settings UX. The in-app bell is always on; these gate the
// outbound email/SMS delivery of those same notifications.
export function NotificationSettingsForm({ initial }: { initial: NotificationPrefsInitial }) {
  const [emailEnabled, setEmailEnabled] = useState(initial.emailEnabled);
  const [smsEnabled, setSmsEnabled] = useState(initial.smsEnabled);
  const [error, setError] = useState<string | null>(null);
  const [savedChannel, setSavedChannel] = useState<Channel | null>(null);

  const emailId = useId();
  const smsId = useId();

  async function persist(channel: Channel, next: boolean, revert: (v: boolean) => void, prev: boolean) {
    setError(null);
    setSavedChannel(null);
    const body = channel === 'email' ? { emailEnabled: next } : { smsEnabled: next };
    const res = await api('/recruiter/notification-preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      revert(prev); // roll the toggle back to its last-known-good value
      setError(res.message);
      return;
    }
    setSavedChannel(channel);
  }

  function toggleEmail(next: boolean) {
    const prev = emailEnabled;
    setEmailEnabled(next);
    void persist('email', next, setEmailEnabled, prev);
  }

  function toggleSms(next: boolean) {
    const prev = smsEnabled;
    setSmsEnabled(next);
    void persist('sms', next, setSmsEnabled, prev);
  }

  return (
    <section className="space-y-1 rounded-md border border-[var(--color-border)]">
      <ToggleRow
        id={emailId}
        title="Email notifications"
        description="Get notified by email about new applications and verification updates."
        checked={emailEnabled}
        onCheckedChange={toggleEmail}
        saved={savedChannel === 'email'}
      />
      <div className="border-t border-[var(--color-border)]" />
      <ToggleRow
        id={smsId}
        title="SMS notifications"
        description="Get the same alerts as a text message."
        checked={smsEnabled}
        onCheckedChange={toggleSms}
        saved={savedChannel === 'sms'}
        note="SMS delivery is coming soon — your preference is saved and will apply once it launches."
      />
      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </section>
  );
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  saved,
  note,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  saved: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-[var(--color-fg)]">
          {title}
        </label>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{description}</p>
        {note && <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saved && (
          <span className="text-xs text-[var(--color-success)]" role="status">
            Saved
          </span>
        )}
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}
