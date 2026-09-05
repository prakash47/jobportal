'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveNavPath } from '../../lib/nav/active-path';

// Desktop primary nav with hover/focus mega-menus under Jobs & Companies.
// The triggers stay real <Link>s — a plain click/Enter ALWAYS navigates; the
// panel is a supplementary disclosure surface (role=region, NOT role=menu,
// since these are ordinary Tab-navigable links, so no aria-haspopup). A single
// `open` key guarantees only one panel is open at a time. Pointer-intent delays
// debounce the hover; Escape, an outside pointerdown, focus leaving the group,
// and route changes all close it. Closed panels stay in the DOM (server-
// rendered → crawlable) but carry `inert`, removing them from the tab order and
// the accessibility tree.
//
// The panel CONTENT arrives as server-rendered ReactNode props (`jobsPanel` /
// `companiesPanel`), so the presentational panels and their whole subtree
// (tiles, CompanyLogo, url builders) never enter the client bundle.

interface NavLink {
  label: string;
  href: string;
}

type MenuKey = 'jobs' | 'companies';
const OPEN_DELAY = 120;
const CLOSE_DELAY = 180;

// The current page is marked with a filled pill, matching what AdminNav and
// DashboardChrome already do for their current item — one active-state language
// across the product rather than a third invention.
//
// This REPLACES a 1px `accent-500` underline that only ever appeared on hover.
// Two things were wrong with it: it marked nothing at all when you were sitting
// ON the page, and at 2.95:1 a single pixel was too faint to read as a state
// change, so it was reported as "no hover effect" even though the CSS was there.
const navLinkBase =
  'rounded-[var(--radius-md)] px-3 py-1.5 text-[15px] font-semibold ' +
  'transition-colors duration-[var(--duration-base)] ease-[var(--ease-out)]';

const navLinkIdle =
  'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] ' +
  // An open mega-panel gets the hover treatment, not the active one: the panel
  // being open says "you are looking at this", the pill says "you are here".
  'data-[open=true]:bg-[var(--color-bg-muted)] data-[open=true]:text-[var(--color-fg)]';

const navLinkActive = 'bg-[var(--color-bg-muted)] text-[var(--color-fg)]';

function navLinkClassFor(active: boolean): string {
  return `${navLinkBase} ${active ? navLinkActive : navLinkIdle}`;
}

export function PrimaryNav({
  links,
  jobsPanel,
  companiesPanel,
}: {
  links: readonly NavLink[];
  jobsPanel: ReactNode;
  companiesPanel: ReactNode;
}) {
  const [open, setOpen] = useState<MenuKey | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefs = useRef<Partial<Record<MenuKey, HTMLAnchorElement | null>>>({});
  const groupRefs = useRef<Partial<Record<MenuKey, HTMLDivElement | null>>>({});
  // Guards the Escape focus-restore from re-opening the panel: moving focus back
  // onto the trigger dispatches focusin, which onFocusCapture would otherwise
  // treat as an intent to open.
  const suppressOpen = useRef(false);
  const pathname = usePathname();

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Close on navigation (clicking any panel link changes the route).
  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  // While a panel is open: Escape closes it (restoring focus to the trigger only
  // when focus was actually inside the group), and a pointerdown outside the
  // group closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const key = open;
      const group = groupRefs.current[key];
      const focusInside = !!group && group.contains(document.activeElement);
      suppressOpen.current = true; // the .focus() below fires focusin synchronously
      setOpen(null);
      if (focusInside) triggerRefs.current[key]?.focus();
      suppressOpen.current = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      const key = open;
      const group = groupRefs.current[key];
      if (group && !group.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const scheduleOpen = useCallback(
    (key: MenuKey) => {
      clearTimers();
      openTimer.current = setTimeout(() => setOpen(key), OPEN_DELAY);
    },
    [clearTimers],
  );
  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      // A mouse-leave must not yank keyboard focus out of the panel: if focus is
      // parked on a link inside the open group, keep it open (onBlur / Escape /
      // outside pointerdown will close it once focus or the pointer leaves).
      setOpen((cur) => {
        if (!cur) return cur;
        const group = groupRefs.current[cur];
        const active = document.activeElement;
        if (group && active && group.contains(active) && active !== triggerRefs.current[cur]) {
          return cur;
        }
        return null;
      });
    }, CLOSE_DELAY);
  }, [clearTimers]);

  const menus: { key: MenuKey; href: string; label: string; regionLabel: string; panel: ReactNode }[] = [
    { key: 'jobs', href: '/jobs', label: 'Jobs', regionLabel: 'Browse jobs', panel: jobsPanel },
    { key: 'companies', href: '/companies', label: 'Companies', regionLabel: 'Browse companies', panel: companiesPanel },
  ];
  const plainLinks = links.filter((l) => l.href !== '/jobs' && l.href !== '/companies');

  return (
    <nav className="hidden items-center gap-3 lg:ml-4 lg:flex" aria-label="Primary">
      {menus.map(({ key, href, label, regionLabel, panel }) => {
        const isOpen = open === key;
        return (
          <div
            key={key}
            ref={(el) => {
              groupRefs.current[key] = el;
            }}
            className="relative flex h-[72px] items-center"
            onMouseEnter={() => scheduleOpen(key)}
            onMouseLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
            }}
            onFocusCapture={() => {
              if (suppressOpen.current) return;
              clearTimers();
              setOpen(key);
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOpen((cur) => (cur === key ? null : cur));
              }
            }}
          >
            <Link
              href={href}
              ref={(el) => {
                triggerRefs.current[key] = el;
              }}
              aria-expanded={isOpen}
              aria-controls={`nav-panel-${key}`}
              aria-current={isActiveNavPath(pathname, href) ? 'page' : undefined}
              data-open={isOpen}
              className={navLinkClassFor(isActiveNavPath(pathname, href))}
            >
              {label}
            </Link>
            <div
              id={`nav-panel-${key}`}
              role="region"
              aria-label={regionLabel}
              inert={!isOpen}
              className={
                'absolute left-0 top-full z-40 ' +
                'transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] ' +
                (isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0')
              }
            >
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lift)]">
                {panel}
              </div>
            </div>
          </div>
        );
      })}
      {plainLinks.map((l) => {
        const active = isActiveNavPath(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={navLinkClassFor(active)}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
