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
          <Link href="/" aria-label="Career Queue — home">
            <Logo variant="mark" className="h-6 w-auto sm:h-7" />
          </Link>
          <Link
            href="/login"
            className="-mx-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
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
