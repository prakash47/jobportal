'use client';

import { useState } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';
import { AuthModal, type AuthTab } from '../auth/AuthModal';
import { MobileMenu } from './MobileMenu';

interface NavLink {
  label: string;
  href: string;
}

// Client island for the header's right-side actions + the auth popup. Owns the
// modal open/tab state so the desktop buttons AND the mobile drawer share one
// AuthModal instance. The triggers are real <button>s (NOT <a href> links): a
// click always opens the popup and can never fall through to a full-page
// navigation — not even in the brief window before this island hydrates, which
// was the cause of the intermittent "redirect to /login instead of popup" bug.
// The /login and /register pages still exist as a fallback (direct URL + the
// footer's Sign in / Create account links) per the "keep routes as fallback"
// decision.
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

  function openLogin() {
    setTab('login');
    setOpen(true);
  }
  function openRegister() {
    setTab('register');
    setOpen(true);
  }

  return (
    <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
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
        className="hidden h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent-500)] px-4 text-sm font-semibold text-[var(--color-primary-700)] transition-colors hover:bg-[var(--color-accent-600)] lg:inline-flex"
      >
        Hire on Career Queue
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>

      <MobileMenu
        links={links}
        recruiterUrl={recruiterUrl}
        onSignIn={openLogin}
        onRegister={openRegister}
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
