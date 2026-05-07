import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';

// SRS §4.5.6 — public landing for the one-click unsubscribe link in alert
// emails. Reads via Prisma directly (no JWT — the token is the capability)
// and flips isActive=false. Idempotent: a pre-fetcher firing the URL twice
// produces the same outcome.
//
// Note: this page intentionally does NOT call requireUser() — the email
// link goes to inboxes where the user may not be signed in. The parent
// /alerts/layout.tsx leaves auth to each authed page.

interface PageProps {
  params: Promise<{ token: string }>;
}

async function unsubscribe(token: string): Promise<{ alertName: string } | null> {
  const alert = await prisma.jobAlert.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, name: true, isActive: true },
  });
  if (!alert) return null;
  if (alert.isActive) {
    await prisma.jobAlert.update({ where: { id: alert.id }, data: { isActive: false } });
  }
  return { alertName: alert.name };
}

export default async function UnsubscribePage({ params }: PageProps) {
  const { token } = await params;
  const result = await unsubscribe(token);

  if (!result) {
    return (
      <div className="rounded-md border border-[var(--color-border)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">Link not recognised</p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          This unsubscribe link may have expired or been used already.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/alerts">Manage your alerts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--color-fg)]">You&rsquo;ve been unsubscribed</p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        We won&rsquo;t email you about &ldquo;{result.alertName}&rdquo; any more. Other alerts are
        unchanged.
      </p>
      <Button asChild className="mt-6">
        <Link href="/alerts">Manage your alerts</Link>
      </Button>
    </div>
  );
}
