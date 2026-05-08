'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';

export interface TagFilterProps {
  tags: { slug: string; label: string; count: number }[];
}

// URL-driven pill row. Mirrors the IndustryFilter on /companies and the
// StatusFilter on /applications — same chip styling for consistency.
export function TagFilter({ tags }: TagFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('tag') ?? 'ALL';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete('tag');
    else params.set('tag', value);
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div role="tablist" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
      <Chip href={buildHref('ALL')} active={current === 'ALL'}>
        All
      </Chip>
      {tags.map((t) => (
        <Chip key={t.slug} href={buildHref(t.slug)} active={current === t.slug}>
          {t.label}
          {t.count > 0 && (
            <span className="ml-1.5 text-[var(--color-fg-subtle)]">{t.count}</span>
          )}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
          : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      )}
    >
      {children}
    </Link>
  );
}
