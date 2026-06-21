import Link from 'next/link';
import { Logo } from '../brand/Logo';

// Slim, focused top bar for the onboarding flow. Mirrors the site header's
// brand chrome (logo + nav) but drops the auth actions — the seeker is already
// signed in here. Server-rendered; nav links let them step out to browse.
const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Jobs', href: '/jobs' },
  { label: 'Companies', href: '/companies' },
  { label: 'Career advice', href: '/career-advice' },
];

export function OnboardingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Career Queue — home" className="flex items-center">
          <Logo variant="mark" priority className="h-8 w-auto" />
        </Link>
        <nav className="ml-auto hidden items-center gap-7 sm:flex" aria-label="Primary">
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
      </div>
    </header>
  );
}
