import Link from 'next/link';
import { getGoogleEnabled } from '../../lib/auth/google-status';
import { getHeaderUser } from '../../lib/auth/header-user';
import { Logo } from '../brand/Logo';
import { ScrollHeaderChrome } from './ScrollHeaderChrome';
import { HeaderAuthActions } from './HeaderAuthActions';

// Homepage header. Desktop (lg+): logo · centred nav · Sign in (outline) +
// Register (solid navy) + a flat "Hire" CTA. Below lg (phones AND tablets):
// logo + hamburger drawer. The lg breakpoint avoids cramming the actions + nav
// at ~768px; the 3-section flex (flex-1 / nav / flex-1) keeps the nav centred
// while everything stays in flow, so the actions can never overlap the links.
//
// The auth actions + mobile drawer live in the HeaderAuthActions client island
// (it owns the shared auth popup). The nav links stay server-rendered for SEO.

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

export async function SiteHeader() {
  // Resolve the session SERVER-SIDE (same path as the dashboard) so the header
  // renders the correct auth state on first paint — no client /auth/me fetch and
  // no "Sign in / Register" flash for a signed-in seeker on /jobs, /job/[slug],
  // etc. Signed-in seekers' brand link also points straight at their dashboard,
  // so the logo skips the "/" → redirect → /profile hop.
  const [googleEnabled, headerUser] = await Promise.all([getGoogleEnabled(), getHeaderUser()]);
  const isSeeker = headerUser?.role === 'CANDIDATE';
  const brandHref = isSeeker ? '/profile' : '/';

  return (
    <ScrollHeaderChrome>
      <div className="mx-auto flex h-14 w-full max-w-[var(--container-max)] items-center px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center">
          <Link
            href={brandHref}
            aria-label={isSeeker ? 'Career Queue — dashboard' : 'Career Queue — home'}
            className="flex items-center"
          >
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

        <HeaderAuthActions
          links={NAV_LINKS}
          recruiterUrl={RECRUITER_URL}
          googleEnabled={googleEnabled}
          {...(headerUser ? { user: { name: headerUser.name, email: headerUser.email } } : {})}
        />
      </div>
    </ScrollHeaderChrome>
  );
}
