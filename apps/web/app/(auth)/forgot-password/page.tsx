import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from '@jobportal/ui/icons';
import { Logo } from '../../../components/brand/Logo';
import { ResetLedger } from '../../../components/auth/ResetLedger';
import { readUserFromCookie } from '../../../lib/auth/server-session';

// Password reset (SRS §4.12.5) — the whole three-step OTP flow lives on this one
// route: request a code, verify it, set the password, then land signed in.
//
// Deliberately NOT wrapped in SiteShell. During a reset the user is by
// definition signed out, so the site header — which resolves signed-in state
// server-side and carries Sign in / Register plus the two-pane mega-menu — is
// empty at best and wrong at worst, and it puts ~40 exits above a 15-minute
// timed task. The footer would add a link farm under a security surface. It
// matches the product's own precedent too: the primary sign-in surface is
// AuthModal, i.e. chrome-suppressed by construction. One masthead, one escape
// hatch.
export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  // A signed-in seeker has no use for this form — and can change their password
  // from settings instead.
  const user = await readUserFromCookie();
  if (user?.role === 'CANDIDATE') redirect('/profile');

  return (
    <main className="min-h-dvh bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <div className="mx-auto flex h-14 w-full max-w-[var(--container-max)] items-center justify-between px-4 sm:h-16 sm:px-6">
          {/* The lockup, not the bare mark: this page is deliberately outside
              SiteShell, so the masthead is the only thing naming the product on
              a security surface where a user needs to know whose form they are
              typing a code into. */}
          <Link href="/" aria-label="Career Queue — home" className="flex items-center">
            <Logo variant="lockup" className="h-8 w-auto sm:h-9" />
          </Link>
          {/* Boxed rather than a bare text link. It is the only escape hatch on
              a chrome-suppressed page, and as plain muted text it read as a
              caption next to the masthead instead of the one thing you can
              click. Bordered, not filled: the primary action on this page is
              the form, and two filled buttons would compete. */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to sign in
          </Link>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-10 sm:min-h-[calc(100dvh-4rem)] sm:items-center sm:py-16">
        <ResetLedger />
      </div>
    </main>
  );
}
