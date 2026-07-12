'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from '@jobportal/ui/icons';
import { cn } from '@jobportal/ui';
import { HeroSearchBar, type HeroCity } from '../home/HeroSearchBar';

// The SRP search field. At rest it looks exactly like the compact `withButton`
// search bar; clicking it POPS OUT (scale+fade, elevated as a popover) into the
// home hero's three-field HeroSearchBar (skills / location / experience),
// prefilled with the current query and auto-focused. Clicking outside, pressing
// Escape, or running a search collapses it back to the compact bar.
//
// The popover is always mounted (toggled with opacity/scale + `inert`) so the
// motion is smooth in BOTH directions with no unmount juggling, and — because
// it has been painted at opacity-0 for many frames before the click — the
// opacity transition fires cleanly on toggle (no rAF gymnastics needed). When
// open, the popover is interactive and the resting trigger is made `inert`;
// when closed, the reverse — so exactly one of the two owns focus + AT at a time.
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
  const restoreFocus = useRef(false);

  // Outside-click + Escape close (only while open).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        restoreFocus.current = true;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the popped-out bar's first field on open. On an Escape-close, return
  // focus to the trigger — but only in THIS effect (post-render), because the
  // open trigger is `inert` and focusing an inert element is a no-op.
  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {/* Resting trigger — mirrors the SearchInput `withButton` segmented bar.
          Made `inert` while open so this invisible copy leaves the tab order + AT. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search jobs"
        aria-expanded={open}
        inert={open}
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
              initialQuery ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]',
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
          'absolute left-0 top-0 z-40 w-full max-w-4xl origin-top-left rounded-2xl shadow-[var(--shadow-float)] transition-[transform,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)] sm:rounded-full',
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.97] opacity-0',
        )}
      >
        <HeroSearchBar cities={cities} initialWhat={initialQuery} onSearch={() => setOpen(false)} />
      </div>
    </div>
  );
}
