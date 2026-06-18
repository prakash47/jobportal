import Link from 'next/link';
import { ArrowRight } from '@jobportal/ui/icons';
import { Logo } from '../brand/Logo';
import { ScrollHeaderChrome } from './ScrollHeaderChrome';
import { MobileMenu } from './MobileMenu';

// Homepage header. Desktop (lg+): logo · centred nav · modern Sign in + a
// gradient "Hire" CTA. Below lg (phones AND tablets): logo + hamburger drawer.
// The lg breakpoint avoids cramming the wide CTA + nav at ~768px; the 3-section
// flex (flex-1 / nav / flex-1) keeps the nav centred while everything stays in
// flow, so the actions can never overlap the links.
//
// The recruiter CTA is a plain styled <a> rather than <Button asChild> — the
// Radix Slot clone hydrated inconsistently inside the ScrollHeaderChrome client island.

const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Jobs', href: '/jobs' },
  { label: 'Companies', href: '/companies' },
  { label: 'Career advice', href: '/career-advice' },
];

// Animated cyan underline on hover — an accent MARK (1px hairline), never
// colored text, so it stays inside the cyan budget and the mandate.
const navLinkClass =
  'relative text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] ' +
  "after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--color-accent-500)] after:content-[''] " +
  'after:transition-[width] after:duration-[var(--duration-base)] after:ease-[var(--ease-out)] hover:after:w-full';

const RECRUITER_URL = process.env.NEXT_PUBLIC_RECRUITER_URL ?? 'http://localhost:3001';

export function SiteHeader() {
  return (
    <ScrollHeaderChrome>
      <div className="mx-auto flex h-14 w-full max-w-[var(--container-max)] items-center px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center">
          <Link href="/" aria-label="Career Queue — home" className="flex items-center">
            <Logo variant="mark" priority className="h-8 w-auto" />
          </Link>
        </div>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={navLinkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          {/* Modern ghost Sign in (desktop). */}
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-lg px-3.5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] lg:inline-flex"
          >
            Sign in
          </Link>

          {/* Engaging gradient recruiter CTA (desktop): white bold text clears
              large-text contrast across the navy→cyan sweep; lifts + glows on hover. */}
          <a
            href={RECRUITER_URL}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-[image:var(--gradient-brand)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-all duration-[var(--duration-base)] ease-[var(--ease-out)] hover:-translate-y-px hover:shadow-[var(--glow-cyan)] lg:inline-flex"
          >
            Hire on Career Queue
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>

          <MobileMenu links={NAV_LINKS} recruiterUrl={RECRUITER_URL} />
        </div>
      </div>
    </ScrollHeaderChrome>
  );
}
