import Link from 'next/link';
import { Logo } from '../brand/Logo';
import { SignOutButton } from './SignOutButton';

// Dashboard top bar. Mirrors the onboarding shell's brand chrome (Career Queue
// logo + primary nav) but adds the signed-in account identity + sign-out on the
// right — the seeker is always authed here (the layout's requireUser guards it).
const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Jobs', href: '/jobs' },
  { label: 'Companies', href: '/companies' },
  { label: 'Career advice', href: '/career-advice' },
];

export function DashboardHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Career Queue — home" className="flex items-center">
          <Logo variant="mark" priority className="h-8 w-auto" />
        </Link>

        <div className="ml-auto flex items-center gap-6">
          <nav className="hidden items-center gap-7 sm:flex" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 sm:border-l sm:border-[var(--color-border)] sm:pl-6">
            <span
              className="hidden max-w-[180px] truncate text-sm text-[var(--color-fg-muted)] md:inline"
              title={email}
            >
              {email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
