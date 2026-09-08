import type { Metadata } from 'next';
import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { readPreferences } from '../../../lib/notifications/preferences';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
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
  const session = await requireUser();
  const sp = await searchParams;
  // Email-footer "Unsubscribe" link routes here with ?unsubscribe=1. We
  // don't auto-toggle anything (a destructive write from a GET would be
  // bad form); the banner just nudges the user to flip the switches they
  // want off and save.
  const fromUnsubscribe = sp['unsubscribe'] === '1';

  // The cadence control writes JobAlert.frequency, so the page needs to know
  // what the user's alerts are currently set to.
  const [prefs, alerts] = await Promise.all([
    readPreferences(),
    prisma.jobAlert.findMany({
      where: { userId: session.sub },
      select: { id: true, frequency: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!prefs) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        Could not load your notification preferences. Please refresh.
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Notification preferences"
        description="Choose which emails you want from Career Queue. Account-related emails (verification, password reset, payment receipts) are always sent."
      />

      {fromUnsubscribe && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4">
          <p className="text-sm text-[var(--color-fg)]">
            Toggle off any channel below and click <strong>Save</strong> to stop
            those emails.
          </p>
        </div>
      )}

      <ContentCard className="p-5 sm:p-6">
        <NotificationPreferencesForm initial={prefs} alerts={alerts} />
      </ContentCard>
    </div>
  );
}
