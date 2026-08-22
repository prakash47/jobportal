import { Logo } from '../../components/brand/Logo';

// Public shell for /login and /accept-invite/[token]. Single-column, form-style,
// generous whitespace (CLAUDE.md §2), mirroring apps/recruiter's (auth) layout.
//
// The brand is deliberately NOT a link here: the recruiter portal's auth header
// links to "/", but this portal's "/" only bounces straight back to /login for
// an anonymous visitor — a link that appears to do nothing.
//
// There is still no "create an account" line, and that remains correct even
// though /accept-invite now creates accounts. This portal has no SIGN-UP: an
// account cannot be started from here, only finished. The route exists solely to
// let someone a super admin has already chosen set their own password, because
// the alternative — the super admin typing it for them — would mean a
// credential known to two people, and the forgot-password shortcut that would
// otherwise replace it fails silently on an account with no password hash
// (password-reset.service.ts, ADR 0001).
//
// CLAUDE.md §9 ("the ADMIN role is assigned only by direct DB write") is now
// split rather than overturned: it stays exactly true for SUPER_ADMIN, the tier
// that can grant every other tier. See docs/adr/0007.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
          <span className="flex items-center gap-2">
            <Logo variant="mark" priority className="h-7 w-auto" />
            <span className="text-sm font-medium text-[var(--color-fg-muted)]">Super Admin</span>
          </span>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center justify-center px-6 py-12">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
