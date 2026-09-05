'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, cn } from '@jobportal/ui';
import { LogOut, Loader2, Menu, Search, X } from '@jobportal/ui/icons';
import { Logo } from '../brand/Logo';
import { NAV_GROUPS, isNavItemActive } from './nav-items';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DashboardChromeProps {
  user: { name: string; email: string; imageUrl?: string | null };
  /** Server-rendered slot (the daily-apply quota pill) placed in the top bar. */
  quotaSlot?: ReactNode;
  children: ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// The brand + grouped nav + account card. Shared verbatim by the desktop rail
// and the mobile drawer so they never drift. Always sits on the navy surface.
function SidebarContent({
  user,
  pathname,
  onNavigate,
  onSignOut,
  signingOut,
}: {
  user: { name: string; email: string; imageUrl?: string | null };
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/profile"
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-label="Career Queue — dashboard"
        className="flex items-center gap-2.5 px-4 py-4"
      >
        <Logo variant="mark" onDark priority className="h-7 w-auto" />
        <span className="text-[15px] font-semibold text-white">Career Queue</span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Dashboard">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? `g${gi}`}>
            {group.label ? (
              <div className="px-3 pb-1 pt-5 text-[11px] font-medium tracking-wide text-white/60">
                {group.label}
              </div>
            ) : null}
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0',
                      active ? 'text-[var(--color-accent-500)]' : 'text-white/70',
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-3 py-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-500)] text-[13px] font-medium text-[var(--color-primary-950)]"
          aria-hidden="true"
        >
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-white">{user.name}</div>
          <div className="truncate text-[11px] text-white/50">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          className="shrink-0 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-[18px]" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export function DashboardChrome({ user, quotaSlot, children }: DashboardChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Close the drawer whenever the route changes (a nav link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close the drawer when the viewport grows to desktop, so the background
  // never stays inert behind a now-hidden drawer.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Modal-drawer behaviour: lock body scroll, focus the close button, trap
  // Tab focus inside the drawer, close on Escape, and restore focus to the
  // hamburger trigger on close (the background is also marked `inert` below).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      menuButtonRef.current?.focus();
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Redirect home regardless so the user is never stuck.
    }
    window.location.assign('/');
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-muted)]">
      {/* Background is inert while the mobile drawer is open so focus + the
          screen-reader cursor stay inside the dialog (honors aria-modal). */}
      <div className="md:flex" {...(open ? { inert: true } : {})}>
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[var(--color-primary-600)] md:flex">
          <SidebarContent
            user={user}
            pathname={pathname}
            onSignOut={signOut}
            signingOut={signingOut}
          />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 sm:px-6">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              className="-ml-1 rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>

            <Link
              href="/jobs"
              className="flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border-strong)]"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Search roles, companies, skills</span>
            </Link>

            <div className="ml-auto flex items-center gap-3">
              {quotaSlot}
              <div className="hidden sm:block">
                <Button asChild size="sm">
                  <Link href="/jobs">
                    <Search className="size-4" aria-hidden="true" />
                    Find jobs
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>

      {open ? (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[var(--color-primary-600)]"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-3 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <SidebarContent
              user={user}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
              onSignOut={signOut}
              signingOut={signingOut}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
