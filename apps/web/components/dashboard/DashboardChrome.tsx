'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@jobportal/ui';
import { ChevronLeft, LogOut, Loader2, Menu, Search, X } from '@jobportal/ui/icons';
import { Logo } from '../brand/Logo';
import { NAV_GROUPS, isNavItemActive } from './nav-items';
import { writeSidebarPreference } from './sidebar-preference';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// The collapse button's aria-controls target. A literal rather than useId()
// because the drawer and the rail both render a SidebarContent, and a
// generated id would differ between them for no benefit — only the rail
// renders the toggle, so exactly one element ever points at this.
const NAV_ID = 'dashboard-sidebar-nav';

export interface DashboardChromeProps {
  user: { name: string; email: string; imageUrl?: string | null };
  /** Server-rendered slot (the daily-apply quota pill) placed in the top bar. */
  quotaSlot?: ReactNode;
  /**
   * Resolved from the cookie on the SERVER (see sidebar-preference.ts), so the
   * rail renders at its final width immediately and the client's initial state
   * matches byte for byte — no hydration mismatch, no width snap.
   */
  defaultCollapsed?: boolean;
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
  collapsed = false,
}: {
  user: { name: string; email: string; imageUrl?: string | null };
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  /**
   * Icon-only rail. Desktop only — the MOBILE DRAWER never passes this. A
   * drawer the user deliberately opened, then has to squint at, would be a
   * worse experience than the one it replaced, and there is no width to
   * reclaim on a phone anyway.
   */
  collapsed?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/profile"
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-label="Career Queue — dashboard"
        className={cn(
          'flex items-center gap-2.5 py-4',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <Logo variant="mark" onDark priority className="h-7 w-auto" />
        {/* Removed from the DOM rather than hidden: the accessible name comes
            from the link's aria-label above, so dropping the text costs nothing
            and avoids a 16rem-wide string being laid out inside a 4rem rail. */}
        {!collapsed && (
          <span className="text-[15px] font-semibold text-white">Career Queue</span>
        )}
      </Link>

      <nav id={NAV_ID} className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Dashboard">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? `g${gi}`}>
            {group.label ? (
              collapsed ? (
                // The grouping is real information, so it survives the collapse
                // as a rule rather than being dropped. aria-hidden because the
                // heading text below still carries it for assistive tech.
                <hr className="mx-2 my-2 border-white/10" aria-hidden="true" />
              ) : (
                <div className="px-3 pb-1 pt-5 text-[11px] font-medium tracking-wide text-white/60">
                  {group.label}
                </div>
              )
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
                  {...(collapsed ? { title: item.label } : {})}
                  className={cn(
                    'relative mt-0.5 flex items-center rounded-lg py-2 text-sm transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    active
                      ? // The cyan bar is the ACTIVE INDICATOR; the fill behind it is
                        // decoration. That split is measured, not stylistic: composited
                        // over the navy rail (#192249), `bg-white/10` lands at 1.35:1 —
                        // less than half of the 3:1 WCAG 1.4.11 needs to distinguish a
                        // component state. A fill cannot rescue it either; white at 30%
                        // only reaches 2.64:1 and by then it is a grey slab, and a
                        // cyan-tinted fill is worse (1.63:1) because it composites toward
                        // the navy. A SOLID accent bar sidesteps compositing entirely and
                        // measures 5.21:1, so the indicator is the bar and the fill can
                        // stay as restrained as CLAUDE.md §2 wants.
                        //
                        // `aria-current="page"` above already carries this for assistive
                        // tech; the bar is the sighted equivalent it never had.
                        cn(
                          'bg-white/10 font-medium text-white',
                          'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px]',
                          'before:-translate-y-1/2 before:rounded-full',
                          'before:bg-[var(--color-accent-500)]',
                        )
                      : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0',
                      active ? 'text-[var(--color-accent-500)]' : 'text-white/70',
                    )}
                  />
                  {/* The label stays in the DOM when collapsed, just visually
                      hidden. An aria-label would have worked too, but keeping
                      the real text means the accessible name cannot drift from
                      the visible one, and it is what a screen reader would have
                      read anyway. `title` above is the sighted equivalent — the
                      rail is md+ only, so hover genuinely exists here. */}
                  <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'mt-auto flex border-t border-white/10 px-3 py-3',
          collapsed ? 'flex-col items-center gap-2' : 'items-center gap-3',
        )}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-500)] text-[13px] font-medium text-[var(--color-primary-950)]"
          {...(collapsed ? { title: `${user.name} — ${user.email}` } : { 'aria-hidden': true })}
        >
          {initials(user.name)}
        </span>
        {/* Collapsed, the initials disc is the only thing identifying the
            account, so it stops being decorative and takes a title. Expanded,
            the name is right beside it and the disc is redundant to a screen
            reader — hence the aria-hidden swap above rather than one or the
            other in both states. */}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            {/*
              `title` on both, because both are `truncate` and either can clip.
              Measured in the 256px rail: the text column is 142px, and
              "arjun.iyer+demo@jobportal.dev" needs 155px — so the email clips
              for an ordinary address, and a longer one clips much harder.
              Widening the column is not a general fix; addresses have no useful
              upper bound.

              Native `title` rather than the Radix Tooltip in packages/ui: that
              primitive is exported but used by nothing in any app, so adopting
              it here would mean mounting a TooltipProvider for a hover hint on
              two lines of text. `title` is also already the pattern in this
              file (the collapsed nav labels) and elsewhere for truncated text.

              Note this is a SIGHTED-user affordance only. Truncation is purely
              visual — the full string is in the DOM, so screen readers already
              read the whole address and always did.
            */}
            <div title={user.name} className="truncate text-[13px] font-medium text-white">
              {user.name}
            </div>
            <div title={user.email} className="truncate text-[11px] text-white/50">
              {user.email}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          {...(collapsed ? { title: 'Sign out' } : {})}
          className={cn(
            'shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-50',
            // Warning treatment, owner's call. The colour is MIXED toward white
            // rather than bare --color-danger: measured against the navy rail
            // (rgb 25/34/73), the bare token is only 3.48:1 — it scrapes the
            // 3:1 floor and reads muddy on dark navy. At 40% white it is
            // 6.79:1, still unmistakably red and as legible as the white/70
            // icons above it, so it signals weight without looking broken.
            'text-[color-mix(in_oklch,var(--color-danger),white_40%)]',
            // Hover cannot be carried by a background tint here: a translucent
            // red over navy measures 1.07-1.20:1 at every usable alpha, i.e.
            // invisible. So hover brightens the icon and the tint is only a
            // supporting cue.
            'hover:bg-[color-mix(in_oklch,var(--color-danger),transparent_82%)]',
            'hover:text-[color-mix(in_oklch,var(--color-danger),white_15%)]',
          )}
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

export function DashboardChrome({
  user,
  quotaSlot,
  defaultCollapsed = false,
  children,
}: DashboardChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Seeded from the server-read cookie, so this matches what was painted.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      // Written here rather than in an effect: an effect keyed on
      // `collapsed` would also fire on mount and rewrite the cookie the
      // server just read, which is noise at best and would clobber a value
      // set in another tab at worst.
      writeSidebarPreference(next);
      return next;
    });
  };

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

  // The sidebar button now ASKS; only the dialog's confirm actually signs out.
  // Signing out is one click away from every dashboard page and sits directly
  // beside the account card, so a mis-click cost a session with no undo.
  function requestSignOut() {
    // Close the mobile drawer first. It runs its own focus trap and Escape
    // handler and marks the background `inert`; layering a Radix dialog on top
    // means two modals fighting over focus, and one Escape press reaching both.
    // On desktop this is already false and the call is a no-op.
    setOpen(false);
    setConfirmSignOut(true);
  }

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
        <aside
          className={cn(
            'relative sticky top-0 hidden h-screen shrink-0 flex-col bg-[var(--color-primary-600)] md:flex',
            // 200ms ease-out, per CLAUDE.md §2's 150-250ms band. Only `width`
            // is transitioned, not `all`: the rail contains a sticky element
            // and a dozen colour transitions already, and animating everything
            // makes the collapse feel mushy rather than crisp.
            'transition-[width] duration-200 ease-out',
            collapsed ? 'w-16' : 'w-64',
          )}
        >
          <SidebarContent
            user={user}
            pathname={pathname}
            onSignOut={requestSignOut}
            signingOut={signingOut}
            collapsed={collapsed}
          />

          {/*
            The collapse handle STRADDLES the rail's right edge, vertically
            centred, rather than sitting inside the rail.

            It lived inside at the bottom first, and that was wrong: a
            full-width row directly beneath the account card reads as one more
            nav item, and it visually annexed the account block instead of
            letting it end the rail. Moving it onto the border makes it
            unambiguously chrome that acts ON the sidebar rather than an entry
            IN it — and the vertical centre is reachable wherever the nav has
            scrolled to, which the bottom was not.

            `translate-x-1/2` puts half the disc over the navy and half over the
            page, which is what makes it read as a hinge. Nothing clips it: the
            aside has no overflow rule (only the <nav> inside it scrolls).
            z-30 clears the sticky header's z-20 — they never overlap, since
            this is centred, but the header wins any future layout change and
            an invisible control would be worse than a slightly bold z-index.
          */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={NAV_ID}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'absolute right-0 top-1/2 z-30 hidden size-6 -translate-y-1/2 translate-x-1/2',
              'items-center justify-center rounded-full md:flex',
              'border border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
              'text-[var(--color-fg-muted)] shadow-sm transition-colors',
              'hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
              // --color-ring, NOT --color-focus-ring. The latter is a 22%-transparent
              // wash (theme.css:100) and makes a barely-visible ring; the solid
              // --color-ring is what the other 23 focus rings in this app use.
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
            )}
          >
            <ChevronLeft
              className={cn(
                'size-4 transition-transform duration-200 ease-out',
                collapsed && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
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
            {/*
              max-w-6xl (1152px), up from max-w-5xl (1024px). Reported as
              "excessive blank whitespace and fixed narrow card width" on the
              saved-jobs list.

              Measured at a 1600px viewport before changing anything: the
              container sat at 1024px with 152px of margin either side, which is
              a reasonable reading width — so the container was NOT the main
              problem. The row was: its title column was 813px wide holding
              roughly 250px of text, leaving ~550px of dead space in every row.
              Filling that with real metadata (location / experience / salary)
              was the substantive fix.

              This is the smaller half of it. 1152px keeps line lengths
              comfortable while giving dense list rows more room, and it is
              applied to the SHELL so every dashboard page moves together —
              widening one page and not its siblings is how a dashboard starts
              looking assembled from parts.
            */}
            <div className="mx-auto w-full max-w-6xl">{children}</div>
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
              onSignOut={requestSignOut}
              signingOut={signingOut}
            />
          </aside>
        </div>
      ) : null}

      {/*
        Rendered ONCE here, not inside SidebarContent. SidebarContent is mounted
        twice — the desktop rail and the mobile drawer — so putting the dialog
        in it would mount two, and Radix would have two roots competing for the
        same focus and Escape.

        Not dismissible while the request is in flight: `onOpenChange` ignores
        close attempts once `signingOut` is true. The confirm handler ends in
        window.location.assign, so the component is about to be torn down —
        letting the user close the dialog in that window would show them a
        working-looking page that is already navigating away.
      */}
      <Dialog
        open={confirmSignOut}
        onOpenChange={(next) => {
          if (!next && signingOut) return;
          setConfirmSignOut(next);
        }}
      >
        {/* max-w-md, down from the primitive's max-w-lg (512px). Two lines of
            copy centred in a 512px box is what made this read as unfinished —
            a short confirmation needs a box sized to its content, not the
            widest one available. */}
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {/* Neutral, not coloured. A red or amber badge here would say
                "danger", and signing out is not destructive — the same reason
                the confirm button is `primary`. CLAUDE.md §2: calm, restrained,
                one accent used sparingly. */}
            {/* Warning treatment, owner's call — reversing the neutral disc
                this shipped with. A danger-tinted wash rather than a solid red
                fill: the glyph needs to read ON the disc, and a saturated fill
                would make this the loudest thing on a screen whose job is to
                ask a calm question. */}
            <span
              aria-hidden="true"
              className="mb-1 flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-danger),var(--color-bg-elevated)_88%)] text-[var(--color-danger)]"
            >
              <LogOut className="size-5" />
            </span>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              You&rsquo;ll need to sign in again to see your applications, saved jobs and
              alerts. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>

          {/* WHICH account. This is the part that turns a generic prompt into a
              specific one, and it is what Google, GitHub and Stripe all show
              here — it matters most to the people most likely to mis-click:
              anyone signed into more than one account. Bordered rather than
              shadowed, per §2. */}
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-500)] text-[13px] font-medium text-[var(--color-primary-950)]"
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div
                title={user.name}
                className="truncate text-sm font-medium text-[var(--color-fg)]"
              >
                {user.name}
              </div>
              {/* Same truncate + title treatment as the sidebar footer: the
                  dialog is narrower than it looks once the disc is subtracted,
                  and addresses have no useful upper bound. */}
              <div
                title={user.email}
                className="truncate text-xs text-[var(--color-fg-muted)]"
              >
                {user.email}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setConfirmSignOut(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            {/* `danger` on the owner's instruction, reversing the earlier
                `primary`. The argument against it is recorded in PROGRESS.md
                rather than re-run here: signing out is reversible, so this
                spends some of the weight `danger` carries elsewhere. The
                owner's counter-argument is the one that decides it — an
                irreversible-feeling action deserves a colour that makes people
                stop, and losing a session mid-application is a real cost to a
                job seeker even if the account survives. */}
            <Button variant="danger" loading={signingOut} onClick={() => void signOut()}>
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
