import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import {
  NotificationSettingsForm,
  type NotificationPrefsInitial,
} from '../../../components/notifications/NotificationSettingsForm';

// Recruiter "Notification settings". Reads the recruiter's channel preferences
// in the RSC via Prisma (reads/writes split); the client form PATCHes the BFF.
// L2 of the killswitch lives here — if an admin flips
// killswitch.recruiter_notifications ON the page 404s (L3 in the API service is
// the trusted, non-bypassable layer).

export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  if (await isFlagEnabled('killswitch.recruiter_notifications')) notFound();

  const session = (await readUserFromCookie())!;
  const prefs = await prisma.recruiterNotificationPreference.findUnique({
    where: { userId: session.sub },
    select: { emailEnabled: true, smsEnabled: true },
  });

  const initial: NotificationPrefsInitial = {
    emailEnabled: prefs?.emailEnabled ?? true,
    smsEnabled: prefs?.smsEnabled ?? false,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Notification settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Choose how you want to hear about new applications and company verification updates.
          In-app notifications always appear in the bell at the top.
        </p>
      </header>

      <NotificationSettingsForm initial={initial} />
    </div>
  );
}
