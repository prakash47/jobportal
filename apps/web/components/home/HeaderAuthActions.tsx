'use client';

import { useState } from 'react';
import { ArrowRight } from '@jobportal/ui/icons';
import { AuthModal, type AuthTab } from '../auth/AuthModal';
import { MobileMenu } from './MobileMenu';

interface NavLink {
  label: string;
  href: string;
}

// True only for a plain primary click we should intercept. Modified clicks
// (cmd/ctrl/shift/alt or middle-click) fall through so the real /login and
// /register pages still open in a new tab — progressive enhancement.
function isPlainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

// Client island for the header's right-side actions + the auth popup. Owns the
// modal open/tab state so the desktop buttons AND the mobile drawer share one
// AuthModal instance. The desktop triggers are real <a href> links (no-JS /
// crawlers reach the working pages) whose plain-click opens the popup instead.
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
      {/* Sign in — outline (the reference's "Login"). */}
      <a
        href="/login"
        onClick={(e) => {
          if (isPlainClick(e)) {
            e.preventDefault();
            openLogin();
          }
        }}
        className="hidden h-9 items-center rounded-lg border border-[var(--color-border-strong)] px-3.5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] lg:inline-flex"
      >
        Sign in
      </a>

      {/* Register — solid navy (the reference's "Register"). Opens the Register tab. */}
      <a
        href="/register"
        onClick={(e) => {
          if (isPlainClick(e)) {
            e.preventDefault();
            openRegister();
          }
        }}
        className="hidden h-9 items-center rounded-lg bg-[var(--color-primary-600)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-primary-700)] lg:inline-flex"
      >
        Register
      </a>

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
