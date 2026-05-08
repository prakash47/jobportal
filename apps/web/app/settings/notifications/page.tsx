import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '../../../lib/auth/require-user';
import { readPreferences } from '../../../lib/notifications/preferences';
import { NotificationPreferencesForm } from '../../../components/settings/NotificationPreferencesForm';

// SRS §4.13.4 — settings page is private; never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationSettingsPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  // Email-footer "Unsubscribe" link routes here with ?unsubscribe=1. We
  // don't auto-toggle anything (a destructive write from a GET would be
  // bad form); the banner just nudges the user to flip the switches they
  // want off and save.
  const fromUnsubscribe = sp['unsubscribe'] === '1';

  const prefs = await readPreferences();
  if (!prefs) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-[var(--color-fg-muted)]">
          Could not load your notification preferences. Please refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="space-y-1">
        <div className="text-xs">
          <Link
            href="/profile"
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            ← Back to profile
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Notification preferences
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Choose which emails you want from JobPortal. Account-related emails
          (verification, password reset, payment receipts) are always sent.
        </p>
      </header>

      {fromUnsubscribe && (
        <div className="mt-6 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4">
          <p className="text-sm text-[var(--color-fg)]">
            Toggle off any channel below and click <strong>Save</strong> to stop
            those emails.
          </p>
        </div>
      )}

      <div className="mt-8">
        <NotificationPreferencesForm initial={prefs} />
      </div>
    </div>
  );
}
