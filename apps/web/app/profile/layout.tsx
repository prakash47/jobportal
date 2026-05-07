import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '../../lib/auth/require-user';
import { ProfileNav } from '../../components/profile/ProfileNav';

// SRS §4.3 — profile pages are private; never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-10 md:self-start">
          <ProfileNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
