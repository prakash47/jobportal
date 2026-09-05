'use client';

import Link from 'next/link';
import { Avatar, Popover, PopoverContent, PopoverTrigger } from '@jobportal/ui';
import {
  Bell,
  Bookmark,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  Settings,
} from '@jobportal/ui/icons';

export interface HeaderUser {
  name: string;
  email: string;
  /** Already resolved against the current asset bases by getHeaderUser. */
  imageUrl?: string | null;
}

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

// Signed-in destinations for the account menu (shared by the desktop popover
// and the mobile drawer so they never drift).
export const ACCOUNT_LINKS: ReadonlyArray<{ label: string; href: string; icon: IconType }> = [
  { label: 'Dashboard', href: '/profile', icon: LayoutDashboard },
  { label: 'Saved jobs', href: '/saved-jobs', icon: Bookmark },
  { label: 'Applications', href: '/applications', icon: ClipboardList },
  { label: 'Job alerts', href: '/alerts', icon: Bell },
  { label: 'Settings', href: '/settings/notifications', icon: Settings },
];

export function userInitials(user: HeaderUser): string {
  const source = user.name.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// Desktop (lg+) account menu: an avatar trigger opening a popover with the
// account identity, the signed-in destinations, and Sign out. Flat navy avatar,
// tokens only (CLAUDE.md §2).
export function UserMenu({
  user,
  onSignOut,
  signingOut,
}: {
  user: HeaderUser;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-elevated)]"
        >
          {/*
            The Avatar primitive already supported `src`; nothing passed it, so
            an uploaded (or Google) photo existed in the column and was never
            shown. Radix falls back to the initials on its own if the image
            fails to load, so a dead URL degrades instead of leaving a hole.
          */}
          <Avatar
            size="md"
            {...(user.imageUrl ? { src: user.imageUrl } : {})}
            alt=""
            fallback={userInitials(user)}
            className="bg-[var(--color-primary-600)] text-white"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="truncate text-sm font-medium text-[var(--color-fg)]">{user.name}</div>
          <div className="truncate text-xs text-[var(--color-fg-muted)]">{user.email}</div>
        </div>
        <nav className="p-1.5" aria-label="Account">
          {ACCOUNT_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              <Icon className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] p-1.5">
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-fg-muted)]" aria-hidden="true" />
            ) : (
              <LogOut className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
            )}
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
