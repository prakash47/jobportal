'use client';

import { useEffect, useState } from 'react';
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
// Signed-in state resolves on the CLIENT (GET /auth/me) rather than server-side,
// so this header stays safe inside statically revalidated pages (e.g. the ISR
// homepage) without opting them into dynamic rendering. Anon is the pre-resolve
// default (matches the vast majority of visitors + SSR), so there is no flash
// for signed-out users; a signed-in visitor briefly sees the logged-out actions
// until /auth/me returns, then the account menu swaps in.
export function HeaderAuthActions({
  links,
  recruiterUrl,
  googleEnabled,
}: {
  links: readonly NavLink[];
  recruiterUrl: string;
  googleEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AuthTab>('login');
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: { name?: string; email?: string } } | null) => {
        if (cancelled) return;
        const u = data?.user;
        if (u && typeof u.email === 'string') {
          setUser({ name: u.name && u.name.trim() ? u.name : u.email, email: u.email });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
