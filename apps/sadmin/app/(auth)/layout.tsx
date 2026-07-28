import { Logo } from '../../components/brand/Logo';

// Public shell for /login. Single-column, form-style, generous whitespace
// (CLAUDE.md §2), mirroring apps/recruiter's (auth) layout.
//
// The brand is deliberately NOT a link here: the recruiter portal's auth header
// links to "/", but this portal's "/" only bounces straight back to /login for
// an anonymous visitor — a link that appears to do nothing. There is also no
// "create an account" line, because this portal has no sign-up by design: the
// ADMIN role is assigned only by direct DB write / the seed (CLAUDE.md §9).
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
