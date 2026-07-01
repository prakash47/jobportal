'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { ChevronDown } from '@jobportal/ui/icons';

// Top-level items — flat, text-only (the portal's Linear-restraint rail).
const TOP_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/profile', label: 'Profile' },
  { href: '/kyc', label: 'Verification' },
  { href: '/users', label: 'Users' },
] as const;

// "Settings" is a collapsible group; its children are real routes under
// /settings. Notification settings moved here from its old top-level /notification-settings.
const SETTINGS_ITEMS = [
  { href: '/settings/notification-settings', label: 'Notification settings' },
  { href: '/settings/change-password', label: 'Change password' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ROW = 'rounded-md px-3 py-1.5 transition-colors';
const ROW_ACTIVE = 'bg-[var(--color-bg-muted)] font-medium text-[var(--color-fg)]';
const ROW_IDLE =
  'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]';

// Linear-style left rail. Active state via aria-current; subtle hover row rather
// than a heavy fill (CLAUDE.md §2 — restraint). "Settings" is a disclosure: the
// parent button toggles, the sub-items are the real destinations.
export function SidebarNav() {
  const pathname = usePathname();
  const submenuId = useId();
  // /settings and every /settings/* child (incl. the redirect stub pages) belong
  // to the group — used to auto-expand on first load and to highlight the parent.
  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');
  const [open, setOpen] = useState(settingsActive);

  return (
    <nav aria-label="Recruiter portal" className="flex flex-col gap-0.5 text-sm">
      {TOP_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            {item.label}
          </Link>
        );
      })}

      {/* Settings — collapsible. Parent is highlighted (not aria-current) when a
          child is active, so the active page stays the sub-item. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={submenuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(ROW, 'flex items-center justify-between gap-2 text-left', settingsActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span>Settings</span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>

      {/* display toggled via class (not the `hidden` attr) to avoid Tailwind's
          class-vs-UA specificity gotcha; when closed the links leave the tab order. */}
      <ul id={submenuId} className={cn('mt-0.5 flex-col gap-0.5 pl-3', open ? 'flex' : 'hidden')}>
        {SETTINGS_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(ROW, 'block', active ? ROW_ACTIVE : ROW_IDLE)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
