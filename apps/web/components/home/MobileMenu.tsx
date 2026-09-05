'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Menu, X, ArrowRight, Loader2, LogOut } from '@jobportal/ui/icons';
import { ACCOUNT_LINKS, type HeaderUser } from '../shell/UserMenu';
import { usePathname } from 'next/navigation';
import { isActiveNavPath } from '../../lib/nav/active-path';

interface NavLink {
  label: string;
  href: string;
}

// Mobile navigation (< lg): a hamburger that opens a full-width drawer. The
// drawer + backdrop are PORTALED to <body> — if they render inside the sticky
// header (its own z-50 stacking context), the backdrop paints over the header
// and dims it. At the body level the header (z-50) stays clean above the
// backdrop (z-40), and the drawer sits flush under it (top-[72px]). Closes on link
// tap / backdrop / Escape; locks body scroll while open.
//
// Signed-out: Sign in / Register open the shared auth popup (owned by
// HeaderAuthActions) — the drawer closes first, then the popup opens.
// Signed-in: the same drawer shows the account destinations + Sign out.
export function MobileMenu({
  links,
  recruiterUrl,
  onSignIn,
  onRegister,
  user,
  onSignOut,
  signingOut = false,
}: {
  links: readonly NavLink[];
  recruiterUrl: string;
  onSignIn: () => void;
  onRegister: () => void;
  user?: HeaderUser;
  onSignOut?: () => void;
  signingOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function handleSignIn() {
    setOpen(false);
    onSignIn();
  }
  function handleRegister() {
    setOpen(false);
    onRegister();
  }
  function handleSignOut() {
    setOpen(false);
    onSignOut?.();
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      {open &&
        createPortal(
          <>
            <div
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            />
            <div className="rise fixed inset-x-0 top-[72px] z-40 max-h-[calc(100svh-72px)] overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 pb-5 pt-2 shadow-[var(--shadow-lift)]">
              {user ? (
                <div className="mb-1 flex items-center gap-3 border-b border-[var(--color-border)] px-3 pb-3 pt-2">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-600)] text-[13px] font-medium text-white"
                    aria-hidden="true"
                  >
                    {(user.name.trim() || user.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--color-fg)]">{user.name}</div>
                    <div className="truncate text-xs text-[var(--color-fg-muted)]">{user.email}</div>
                  </div>
                </div>
              ) : null}

              <nav className="flex flex-col" aria-label="Mobile">
                {links.map((l) => {
                  // A phone has no hover, so the current page is the ONLY
                  // wayfinding signal available here — the drawer needs this
                  // more than the desktop nav does, not less.
                  const active = isActiveNavPath(pathname, l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={
                        'rounded-lg px-3 py-3 text-base font-medium transition-colors ' +
                        (active
                          ? 'bg-[var(--color-bg-muted)] text-[var(--color-fg)]'
                          : 'text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]')
                      }
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>

              {user ? (
                <div className="mt-2 flex flex-col border-t border-[var(--color-border)] pt-2">
                  {ACCOUNT_LINKS.map(({ label, href, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                    >
                      <Icon className="size-5 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
                      {label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] disabled:opacity-50"
                  >
                    {signingOut ? (
                      <Loader2 className="size-5 shrink-0 animate-spin text-[var(--color-fg-muted)]" aria-hidden="true" />
                    ) : (
                      <LogOut className="size-5 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
                    )}
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-border-strong)] text-sm font-semibold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={handleRegister}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-primary-600)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-700)]"
                  >
                    Register
                  </button>
                  <a
                    href={recruiterUrl}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent-500)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-600)]"
                  >
                    Hire talent
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
