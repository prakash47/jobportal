import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { Logo } from '../brand/Logo';
import { ScrollHeaderChrome } from './ScrollHeaderChrome';

// Animated cyan underline on hover — an accent MARK (1px hairline), never
// colored text, so it stays inside the cyan budget and the mandate.
const navLinkClass =
  'relative text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] ' +
  "after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--color-accent-500)] after:content-[''] " +
  'after:transition-[width] after:duration-[var(--duration-base)] after:ease-[var(--ease-out)] hover:after:w-full';

// Homepage-scoped header. Other routes still use their per-page chrome; a
// global SiteHeader that every route opts into is its own PR (touches every
// existing page). Keep this lean — logo, three nav anchors, sign-in, primary
// recruiter CTA. No header search — the hero owns it.
//
// Layout: a 3-column grid (1fr / auto / 1fr) rather than flex+justify-between,
// so the centre nav stays in the header's true centre regardless of the
// (asymmetric) logo and CTA widths on either side.

const RECRUITER_URL = process.env.NEXT_PUBLIC_RECRUITER_URL ?? 'http://localhost:3001';

export function SiteHeader() {
  return (
    <ScrollHeaderChrome>
      <div className="mx-auto grid h-14 w-full max-w-[var(--container-max)] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Career Queue — home" className="flex items-center justify-self-start">
          <Logo variant="mark" priority className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 justify-self-center md:flex" aria-label="Primary">
          <Link href="/jobs" className={navLinkClass}>
            Jobs
          </Link>
          <Link href="/companies" className={navLinkClass}>
            Companies
          </Link>
          <Link href="/career-advice" className={navLinkClass}>
            Career advice
          </Link>
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <Link
            href="/login"
            className="hidden text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] sm:block"
          >
            Sign in
          </Link>
          <Button asChild variant="secondary" size="sm">
            <a href={RECRUITER_URL}>Hire on Career Queue</a>
          </Button>
        </div>
      </div>
    </ScrollHeaderChrome>
  );
}
