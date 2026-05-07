import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '../../lib/auth/require-user';

// SRS §4.4 — saved jobs dashboard is private; never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SavedJobsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            JobPortal
          </Link>
          <p className="text-sm text-[var(--color-fg-muted)]">{user.email}</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
