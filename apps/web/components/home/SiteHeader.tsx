import Link from 'next/link';
import { getGoogleEnabled } from '../../lib/auth/google-status';
import { getHeaderUser } from '../../lib/auth/header-user';
import { Logo } from '../brand/Logo';
import { ScrollHeaderChrome } from './ScrollHeaderChrome';
import { HeaderAuthActions } from './HeaderAuthActions';

// Site header. Desktop (lg+): logo + "Career Queue" wordmark + LEFT-aligned nav
// (Jobs / Companies / Career advice), then Sign in / Register / Hire (or the
// account menu) pushed to the right edge. Below lg (phones AND tablets): logo +
// hamburger drawer. HeaderAuthActions takes flex-1 + justify-end, so it always
// sits at the right while the brand + nav cluster on the left.
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
  'relative text-[15px] font-semibold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] ' +
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
      <div className="mx-auto flex h-[72px] w-full max-w-[var(--container-max)] items-center gap-5 px-4 sm:px-6 lg:gap-8 lg:px-8">
        <Link
          href={brandHref}
          aria-label={isSeeker ? 'Career Queue — dashboard' : 'Career Queue — home'}
          className="flex shrink-0 flex-col items-center justify-center gap-1.5 leading-none"
        >
          {/*
            The CQ mark is centred over the wordmark below it (items-center centres
            each child's box on the same axis). But the visible glyph is NOT centred
            inside its own PNG: the opaque pixels of cq-mark-color.png (400×178) run
            x=52→368, i.e. 52px transparent padding on the left vs 32px on the right,
            so the glyph's optical centre sits +10px (≈2.5% of width) right of the box
            centre → ~2px at h-9. `-translate-x-[2px]` cancels that so the *visible*
            glyph is truly centred over the text (equal space L/R). Replaces the old
            eyeballed `pl-1` nudge. (Measured, not guessed.)
          */}
          <Logo variant="mark" priority className="h-9 w-auto -translate-x-[2px]" />
          <span className="text-base font-semibold leading-none tracking-tight text-[var(--color-primary-600)]">
            Career Queue
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:ml-6 lg:flex" aria-label="Primary">
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
