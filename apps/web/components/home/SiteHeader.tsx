import Link from 'next/link';
import { Button } from '@jobportal/ui';

// Homepage-scoped header. Other routes still use their per-page chrome; a
// global SiteHeader that every route opts into is its own PR (touches every
// existing page). Keep this lean — logo, three nav anchors, sign-in, primary
// recruiter CTA. No header search — the hero owns it.

const RECRUITER_URL = process.env.NEXT_PUBLIC_RECRUITER_URL ?? 'http://localhost:3001';

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto flex h-14 w-full max-w-[var(--container-max)] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-[var(--color-fg)]"
        >
          JobPortal
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          <Link
            href="/jobs"
            className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            Jobs
          </Link>
          <Link
            href="/companies"
            className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            Companies
          </Link>
          <Link
            href="/career-advice"
            className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            Career advice
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] sm:block"
          >
            Sign in
          </Link>
          <Button asChild variant="secondary" size="sm">
            <a href={RECRUITER_URL}>Hire on JobPortal</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
