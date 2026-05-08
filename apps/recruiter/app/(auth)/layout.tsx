import Link from 'next/link';

// Public layout for /login, /register, /verify-email/[token] — no sidebar.
// Single-column form-style, generous whitespace per CLAUDE.md §2.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            JobPortal · Recruiter
          </Link>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center justify-center px-6 py-12">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
