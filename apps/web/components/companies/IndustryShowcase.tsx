'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { ChevronLeft, ChevronRight } from '@jobportal/ui/icons';

export interface IndustryShowcaseItem {
  slug: string;
  name: string;
  count: number;
}

// Horizontally-scrollable "browse by industry" rail (the reference layout) —
// white category cards on a faint brand-navy band, each showing the real company
// count and linking to the filtered directory. Brand colours only (navy name,
// cyan count), no gradients. Scroll arrows appear only when there's overflow in
// that direction; the row is keyboard- and touch-scrollable regardless.
export function IndustryShowcase({
  items,
  activeSlug,
}: {
  items: IndustryShowcaseItem[];
  activeSlug: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Preserve the active sort/hiring filters when switching industry (matches the
  // sidebar); only reset the page.
  function hrefFor(slug: string): string {
    const p = new URLSearchParams(searchParams.toString());
    p.set('category', slug);
    p.delete('page');
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  function nudge(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 460), behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Browse companies by industry"
      className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary-50)] px-3 py-3.5 sm:px-4"
    >
      <ScrollButton dir="left" onClick={() => nudge(-1)} disabled={!canLeft} />
      <ScrollButton dir="right" onClick={() => nudge(1)} disabled={!canRight} />

      <div
        ref={scroller}
        className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it) => {
          const active = activeSlug === it.slug;
          return (
            <Link
              key={it.slug}
              href={hrefFor(it.slug)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'group flex min-w-[188px] snap-start flex-col justify-between gap-4 rounded-xl border bg-[var(--color-bg-elevated)] p-4 transition-colors sm:min-w-[204px]',
                active
                  ? 'border-[var(--color-accent-600)] ring-1 ring-[var(--color-accent-600)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
              )}
            >
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-[var(--color-fg)]">
                {it.name}
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent-700)]">
                {it.count.toLocaleString('en-IN')} {it.count === 1 ? 'company' : 'companies'}
                <ChevronRight
                  className="size-4 -translate-x-0.5 transition-transform group-hover:translate-x-0"
                  aria-hidden="true"
                />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ScrollButton({
  dir,
  onClick,
  disabled,
}: {
  dir: 'left' | 'right';
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  // Kept mounted at the edges (disabled + hidden) rather than unmounted, so a
  // keyboard user's focus is never dropped when the rail reaches an end.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-hidden={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      aria-label={dir === 'left' ? 'Scroll industries left' : 'Scroll industries right'}
      className={cn(
        'absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] shadow-[var(--shadow-card)] transition-opacity hover:text-[var(--color-fg)] sm:flex',
        disabled ? 'pointer-events-none opacity-0' : 'opacity-100',
        dir === 'left' ? 'left-1' : 'right-1',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
