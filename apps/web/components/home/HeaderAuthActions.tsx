'use client';

import { useState } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';
import { AuthModal, type AuthTab } from '../auth/AuthModal';
import { MobileMenu } from './MobileMenu';
import { UserMenu, type HeaderUser } from '../shell/UserMenu';

interface NavLink {
  label: string;
  href: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Client island for the header's right-side actions + the auth popup. Owns the
// modal open/tab state so the desktop buttons AND the mobile drawer share one
// AuthModal instance. The triggers are real <button>s (NOT <a href> links): a
// click always opens the popup and can never fall through to a full-page
// navigation — not even in the brief window before this island hydrates, which
// was the cause of the intermittent "redirect to /login instead of popup" bug.
//
// Signed-in state is resolved SERVER-SIDE (SiteHeader → getHeaderUser) and passed
// in as `user`, so the correct chrome renders on first paint. Previously this was
// a client GET /auth/me, which flashed "Sign in / Register" for a signed-in
// seeker (e.g. arriving on /jobs from the dashboard) — the reported bug. Rendering
// from the prop also means the header can never disagree with the dashboard about
// whether the user is signed in.
export function HeaderAuthActions({
  links,
  recruiterUrl,
  googleEnabled,
  user,
}: {
  links: readonly NavLink[];
  recruiterUrl: string;
  googleEnabled: boolean;
  /** Server-resolved session; absent = anon. */
  user?: HeaderUser;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AuthTab>('login');
  const [signingOut, setSigningOut] = useState(false);

  function openLogin() {
    setTab('login');
    setOpen(true);
  }
  function openRegister() {
    setTab('register');
    setOpen(true);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      const res = await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      // Only treat logout as done when the SERVER confirms it cleared the session:
      // both auth cookies are HttpOnly, so client JS cannot clear them itself. On a
      // failed request we must NOT show a signed-out UI over a still-live session
      // (a real risk on shared machines) — stay put and let the user retry.
      if (!res.ok) {
        setSigningOut(false);
        return;
      }
    } catch {
      setSigningOut(false);
      return;
    }
    window.location.assign('/');
  }

  return (
    <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
      {user ? (
        <div className="hidden lg:block">
          <UserMenu user={user} onSignOut={signOut} signingOut={signingOut} />
        </div>
      ) : (
        <>
          {/* Sign in — outline (the reference's "Login"). Opens the Sign-in tab. */}
          <button
            type="button"
            onClick={openLogin}
            className="hidden h-9 items-center rounded-lg border border-[var(--color-border-strong)] px-3.5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] lg:inline-flex"
          >
            Sign in
          </button>

          {/* Register — solid navy (the reference's "Register"). Opens the Register tab. */}
          <button
            type="button"
            onClick={openRegister}
            className="hidden h-9 items-center rounded-lg bg-[var(--color-primary-600)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-primary-700)] lg:inline-flex"
          >
            Register
          </button>

          {/* "For Employers" slot — flat pale-cyan tint + navy text (no gradient),
              text unchanged per owner. */}
          <a
            href={recruiterUrl}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent-500)] px-4 text-sm font-semibold text-[var(--color-primary-800)] transition-colors hover:bg-[var(--color-accent-600)] lg:inline-flex"
          >
            Hire on Career Queue
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </>
      )}

      <MobileMenu
        links={links}
        recruiterUrl={recruiterUrl}
        onSignIn={openLogin}
        onRegister={openRegister}
        onSignOut={signOut}
        signingOut={signingOut}
        {...(user ? { user } : {})}
      />

      <AuthModal
        open={open}
        tab={tab}
        onOpenChange={setOpen}
        onTabChange={setTab}
        googleEnabled={googleEnabled}
      />
    </div>
  );
}
