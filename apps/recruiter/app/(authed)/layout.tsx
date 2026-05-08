import Link from 'next/link';
import { requireRecruiter } from '../../lib/auth/require-recruiter';
import { SidebarNav } from '../../components/SidebarNav';
import { SignOutButton } from '../../components/SignOutButton';

// Linear-app-shell: fixed 240px sidebar + main pane. Sidebar holds the nav
// and a sign-out at the bottom; header strip mirrors the (auth) layout for
// visual continuity.

export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRecruiter();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--color-border)] md:flex md:flex-col md:justify-between md:p-4">
          <div className="space-y-6">
            <Link
              href="/dashboard"
              className="block px-3 text-sm font-semibold tracking-tight text-[var(--color-fg)]"
            >
              JobPortal · Recruiter
            </Link>
            <SidebarNav />
          </div>
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <p className="truncate px-3 text-xs text-[var(--color-fg-muted)]">{user.email}</p>
            <SignOutButton />
          </div>
        </aside>
        <main className="min-w-0">
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
