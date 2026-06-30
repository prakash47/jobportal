'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@jobportal/ui';

const ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/profile', label: 'Profile' },
  { href: '/kyc', label: 'Verification' },
  { href: '/notification-settings', label: 'Notification settings' },
] as const;

// Linear-style left rail. Active state via aria-current; subtle hover row
// hover state rather than a heavy fill (CLAUDE.md §2 — restraint).
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Recruiter portal" className="flex flex-col gap-0.5 text-sm">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 transition-colors',
              active
                ? 'bg-[var(--color-bg-muted)] font-medium text-[var(--color-fg)]'
                : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
