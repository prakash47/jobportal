import Link from 'next/link';
import { Logo } from '../brand/Logo';
import { ScrollHeaderChrome } from './ScrollHeaderChrome';

// Animated cyan underline on hover — an accent MARK (1px hairline), never
// colored text, so it stays inside the cyan budget and the mandate.
const navLinkClass =
  'relative text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] ' +
  "after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--color-accent-500)] after:content-[''] " +
  'after:transition-[width] after:duration-[var(--duration-base)] after:ease-[var(--ease-out)] hover:after:w-full';

// Homepage-scoped header (logo, three nav anchors, sign-in, recruiter CTA).
// The recruiter CTA is a plain styled <a> rather than <Button asChild>: the
// Radix Slot clone hydrated inconsistently inside the ScrollHeaderChrome client
// island (server/client tree mismatch), so we render the anchor directly and
// carry the secondary-button styling on it.

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
          <a
            href={RECRUITER_URL}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3.5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
          >
            Hire on Career Queue
          </a>
        </div>
      </div>
    </ScrollHeaderChrome>
  );
}
