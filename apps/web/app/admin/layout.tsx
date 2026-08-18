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
      {/* Sticky, so the console keeps an anchor while a long page scrolls. It
          needs an explicit background: without one, content scrolls through a
          transparent bar. This is the document-scroll shell, deliberately NOT
          apps/sadmin's locked viewport (h-screen + overflow-hidden) — adopting
          that here would also remove the mobile rail, since sadmin's aside is
          `hidden md:flex` with no drawer, and this console still has four live
          surfaces that render below md. */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
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
        {/* The rail used to ride the page away. Two separate defects:
            (1) every positioning utility was md:-gated, so BELOW 768px the aside
                computed to `position: static` inside a single-column grid — an
                ordinary flow block stacked above main that simply scrolled off;
            (2) at md+ the sticky did engage, but against a non-sticky header, so
                the rail parked 2rem down with blank page above it.
            Ungating the three utilities fixes (1); the sticky header above fixes
            (2), and `top-16` clears its ~3rem height.

            `self-start` is load-bearing and must stay ungated alongside
            `sticky`: a grid item defaults to `align-self: stretch`, which makes
            the aside as tall as the row, and a sticky box that fills its
            containing block has zero travel and never appears to stick.

            The bounded height plus its own overflow keeps a nav longer than the
            viewport scrollable instead of running off the bottom — the same job
            sadmin's `flex-1 overflow-y-auto` nav wrapper does. Safe on the
            sticky element itself; it is overflow on an ANCESTOR that would kill
            sticky, and there is none (body carries only `font-sans antialiased`,
            and neither globals.css nor theme.css declares an overflow rule). */}
        <aside className="sticky top-16 self-start max-h-[calc(100vh-5rem)] overflow-y-auto">
          <AdminNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
