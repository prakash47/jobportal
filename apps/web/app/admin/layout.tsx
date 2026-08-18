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
      {/* Deliberately NOT sticky, and that is a reversal worth recording.
          Making it sticky does remove the strip of blank page above the rail at
          md+, but an opaque bar pinned at y=0 covers a control that browser
          scroll-into-view has just brought flush to the top — measured at 45px
          tall against a 19px control, i.e. ENTIRELY hidden, which fails WCAG
          2.4.11 Focus Not Obscured (Minimum, AA) whose bar is only "not
          entirely hidden". Compensating needs scroll-padding-top on the
          VIEWPORT, and the only hook for that here is a global rule on <html>
          that would leak to the marketing site. Trading an AA focus failure on
          a page of production feature switches for a cosmetic gap is the wrong
          way round. */}
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
        {/* ⚠ The positioning stays md:-GATED. Ungating it looks like the
            obvious fix for "the rail scrolls away on a phone" and is actively
            harmful: below md the grid is single-column, so the aside is a
            FULL-CONTENT-WIDTH block, and a sticky in-flow grid item is bounded
            by the grid CONTAINER's content box rather than by its own row — so
            it pins at the top while <main> scrolls underneath it. With no
            background and no z-index that is a transparent band of nav text
            superimposed on the page, and elementFromPoint over it returns the
            nav's own <a>, so taps meant for a flag toggle navigate away
            instead. Below md a stacked rail scrolling off with the page is the
            correct behaviour, not the bug.

            What IS added here is the bounded height: without it a nav longer
            than the viewport has its tail pinned off-screen with no way to
            reach it — the same job sadmin's `flex-1 overflow-y-auto` wrapper
            does. Latent with today's four links; free to fix now.

            `md:self-start` is load-bearing next to `md:sticky`: a grid item
            defaults to `align-self: stretch`, which makes the aside as tall as
            the row, and a sticky box filling its containing block has zero
            travel and never appears to stick. The overflow is safe ON the
            sticky element — only overflow on an ANCESTOR would kill it, and
            there is none (body carries just `font-sans antialiased`, and
            neither globals.css nor theme.css declares an overflow rule).

            The remaining cosmetic gap — the rail parks 2rem down with blank
            page above it, because the header scrolls away — is left alone on
            purpose; see the header comment for why the sticky-header fix costs
            more than it buys. `feature/sadmin-admin-migration` retires this
            shell into sadmin's locked viewport, which solves it structurally. */}
        <aside className="md:sticky md:top-8 md:self-start md:max-h-[calc(100vh-4rem)] md:overflow-y-auto">
          <AdminNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
