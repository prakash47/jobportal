'use client';

import { useEffect, useState } from 'react';

export interface CompanyNavItem {
  id: string;
  label: string;
}

// Sticky "on this page" rail with scroll-spy. The server decides which items
// exist (only sections that actually render are passed in), so this component
// just tracks which one is in view and reflects it in the active link. Anchor
// jumps land cleanly because each target section carries `scroll-mt-24`.
export function CompanyProfileNav({ items }: { items: CompanyNavItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    if (items.length === 0) return;
    const sections = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Bias the observer band toward the top of the viewport so the link
    // highlights when a section's heading reaches the sticky-header line,
    // not only when it's centred.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
        On this page
      </p>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const active = it.id === activeId;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                aria-current={active ? 'true' : undefined}
                className={
                  'block rounded-md px-2 py-1.5 text-sm transition-colors ' +
                  (active
                    ? 'bg-[var(--color-primary-100)] font-medium text-[var(--color-primary-800)]'
                    : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]')
                }
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
