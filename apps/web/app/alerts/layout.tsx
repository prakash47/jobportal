import type { Metadata } from 'next';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { DashboardShell } from '../../components/dashboard';

// SRS §4.5 — the alerts dashboard + the public unsubscribe landing share this
// layout. Auth is enforced per-page (each authed page calls requireUser()
// directly) so /alerts/unsubscribe/[token] can render without a session — the
// email link goes to people whose JWT cookie may have expired. Logged-out
// visitors get a bare, chrome-free page (no dashboard sidebar).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AlertsLayout({ children }: { children: React.ReactNode }) {
  const user = await readUserFromCookie();

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
      </div>
    );
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
