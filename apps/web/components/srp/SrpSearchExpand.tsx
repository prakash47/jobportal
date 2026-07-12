'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from '@jobportal/ui/icons';
import { cn } from '@jobportal/ui';
import { HeroSearchBar, type HeroCity } from '../home/HeroSearchBar';

// The SRP search field. At rest it looks exactly like the compact `withButton`
// search bar; clicking it POPS OUT (scale+fade, elevated as a popover) into the
// home hero's three-field HeroSearchBar (skills / location / experience),
// prefilled with the current query and auto-focused. Clicking outside, pressing
// Escape, or running a new search collapses it back to the compact bar.
//
// The popover is always mounted (toggled with opacity/scale + `inert`) so the
// motion is smooth in BOTH directions with no unmount juggling, and — because
// it has been painted at opacity-0 for many frames before the click — the
// opacity transition fires cleanly on toggle (no rAF gymnastics needed).
// `inert` keeps its fields out of the tab order + off screen readers when shut.
export function SrpSearchExpand({
  initialQuery = '',
  cities,
}: {
  initialQuery?: string;
  cities: HeroCity[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close (only while open).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move focus into the popped-out bar's first field when it opens.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {/* Resting trigger — mirrors the SearchInput `withButton` segmented bar. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search jobs"
        aria-expanded={open}
        className={cn(
          'flex w-full max-w-3xl items-stretch overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-left transition-[border-color,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:border-[var(--color-ring)]',
          open && 'opacity-0',
        )}
      >
        <span className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-4 size-5 text-[var(--color-fg-subtle)]"
            aria-hidden="true"
          />
          <span
            className={cn(
              'flex h-14 w-full items-center truncate pl-12 pr-3 text-base',
              initialQuery ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)]',
            )}
          >
            {initialQuery || 'Search jobs by title, skill, or company'}
          </span>
        </span>
        <span className="m-1.5 inline-flex shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary-600)] px-4 text-sm font-semibold text-white sm:px-6">
          <Search className="size-4 sm:hidden" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
        </span>
      </button>

      {/* Popped-out three-field bar (always mounted; toggled for smooth motion). */}
      <div
        ref={panelRef}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          'absolute left-0 top-0 z-40 w-full max-w-4xl origin-top-left rounded-full shadow-[var(--shadow-float)] transition-[transform,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)]',
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.97] opacity-0',
        )}
      >
        <HeroSearchBar cities={cities} initialWhat={initialQuery} />
      </div>
    </div>
  );
}
