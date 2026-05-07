'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@jobportal/ui';

const ITEMS = [
  { href: '/profile', label: 'Overview' },
  { href: '/profile/education', label: 'Education' },
  { href: '/profile/experience', label: 'Experience' },
  { href: '/profile/skills', label: 'Skills' },
  { href: '/profile/resume', label: 'Resume' },
] as const;

export function ProfileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile sections" className="flex flex-col gap-0.5 text-sm">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
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
