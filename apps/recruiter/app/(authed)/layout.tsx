import Link from 'next/link';
import { requireRecruiter } from '../../lib/auth/require-recruiter';
import { SidebarNav } from '../../components/SidebarNav';
import { SignOutButton } from '../../components/SignOutButton';
import { Logo } from '../../components/brand/Logo';

// Linear-app-shell: fixed 240px sidebar + main pane. Sidebar holds the nav
// and a sign-out at the bottom; header strip mirrors the (auth) layout for
// visual continuity.

export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRecruiter();

  // App-shell scroll model: the viewport is locked (h-screen + overflow-hidden)
  // and each pane scrolls independently. The sidebar stays fixed while the main
  // content pane scrolls on its own.
  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg)]">
      <div className="grid h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden h-screen border-r border-[var(--color-border)] md:flex md:flex-col md:justify-between md:overflow-y-auto md:p-4">
          <div className="space-y-6">
            <Link
              href="/dashboard"
              aria-label="Career Queue Recruiter — dashboard"
              className="flex items-center gap-2 px-3"
            >
              <Logo variant="mark" priority className="h-7 w-auto" />
              <span className="text-sm font-medium text-[var(--color-fg-muted)]">Recruiter</span>
            </Link>
            <SidebarNav />
          </div>
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <p className="truncate px-3 text-xs text-[var(--color-fg-muted)]">{user.email}</p>
            <SignOutButton />
          </div>
        </aside>
        <main className="h-screen min-w-0 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
