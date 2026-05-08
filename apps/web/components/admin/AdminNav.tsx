'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@jobportal/ui';

const ITEMS = [
  { href: '/admin/feature-flags', label: 'Feature flags' },
  { href: '/admin/audit-log?type=feature_flag', label: 'Audit log' },
] as const;

// Sidebar nav for /admin/*. Active state matches the pathname only —
// the audit log href carries ?type=feature_flag so the link survives
// a navigation away and back, but pathname comparison ignores the
// query string (correct: the link should highlight whether or not the
// user has a filter applied).
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5 text-sm">
      {ITEMS.map((item) => {
        const itemPath = item.href.split('?')[0] ?? item.href;
        const active = pathname === itemPath;
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
