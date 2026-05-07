import type { Metadata } from 'next';
import Link from 'next/link';
import { readUserFromCookie } from '../../lib/auth/server-session';

// SRS §4.5 — alerts dashboard + the public unsubscribe landing share this
// layout. Auth is enforced per-page (each authed page calls requireUser()
// directly) so /alerts/unsubscribe/[token] can render without a session —
// the email link goes to people whose JWT cookie may have expired.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AlertsLayout({ children }: { children: React.ReactNode }) {
  const user = await readUserFromCookie();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            JobPortal
          </Link>
          {user && (
            <p className="text-sm text-[var(--color-fg-muted)]">{user.email}</p>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
