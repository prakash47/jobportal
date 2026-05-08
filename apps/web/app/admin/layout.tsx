import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '../../lib/auth/require-admin';
import { AdminNav } from '../../components/admin/AdminNav';

// SRS §4.16 — admin console is private; never indexed. Robots header is
// belt-and-braces alongside the requireAdmin() guard at the layout level
// so a misconfigured CDN cache can't expose it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-[var(--color-fg)]"
            >
              JobPortal
            </Link>
            <span className="text-xs text-[var(--color-fg-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--color-fg)]">Admin</span>
          </div>
          <p className="text-xs text-[var(--color-fg-muted)]">{user.email}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-8 md:self-start">
          <AdminNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
