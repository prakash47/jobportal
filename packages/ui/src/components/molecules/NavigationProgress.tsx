'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import {
  NavProgressMachine,
  isEligibleNavClick,
  onNavStart,
} from '../../lib/nav-progress';
import { BrandLoaderMark } from './BrandLoader';

// The navigation loader ("The Advance") — the veil + wiring around the
// BrandLoaderMark. Framework-free: the current route key (pathname + search)
// arrives as a PROP from a thin per-app wrapper, which is also where
// router.push/replace get patched onto the notifyNavStart bus. See
// packages/ui/src/lib/nav-progress.ts for the timing contract.
//
// DETECTION — why the document listener is BUBBLE-phase, and why
// event.defaultPrevented is deliberately ignored:
//   · Next's <Link> calls preventDefault() on every click it handles
//     client-side, so "prevented" is what a REAL navigation looks like —
//     filtering on it would suppress the loader everywhere.
//   · Controls that hijack a click INSIDE a link (JobCardSaveToggle: a save
//     button inside the SRP card's <a>) call stopPropagation() as well, so on
//     the bubble phase the event never reaches document and no false start
//     happens. A capture-phase listener would fire before those handlers and
//     strand the veil until the failsafe.
//   · A component that prevents a link's navigation WITHOUT stopping
//     propagation would false-start the loader; the 15s failsafe unsticks it.
//     No such component exists in the repo today (audited 2026-07-30).
//
// INTERACTION: the veil intercepts pointer events while visible — an opaque
// sheet that lets clicks fall through onto controls the user cannot see is
// worse than briefly blocking input. It never touches focus, announces
// politely via a persistent role="status" region, and carries cursor-progress.

type VeilState = 'hidden' | 'shown' | 'exiting';

export interface NavigationProgressProps {
  /**
   * Current committed route, `${pathname}?${searchParams}` — when this changes
   * the pending navigation is considered done. Comes from usePathname +
   * useSearchParams in the app wrapper (basePath-stripped is fine; it only
   * needs to CHANGE, never to match the anchor URL).
   */
  routeKey: string;
  /**
   * 'full'  — flat near-white veil over the whole viewport (job-seeker site).
   * 'pane'  — 100% opaque white, offset so a fixed navy rail stays crisp and
   *           un-ghosted (recruiter/sadmin); pass the offset via className,
   *           e.g. "md:left-[256px]".
   */
  variant?: 'full' | 'pane';
  className?: string;
}

export function NavigationProgress({
  routeKey,
  variant = 'full',
  className,
}: NavigationProgressProps) {
  const [state, setState] = useState<VeilState>('hidden');
  const machineRef = useRef<NavProgressMachine | null>(null);
  if (machineRef.current === null) {
    machineRef.current = new NavProgressMachine({
      onShow: () => setState('shown'),
      onExit: () => setState('exiting'),
      onHide: () => setState('hidden'),
    });
  }

  // Route committed → end the pending navigation. Skip the initial render
  // (mount is not a navigation).
  const lastRouteKey = useRef(routeKey);
  useEffect(() => {
    if (lastRouteKey.current !== routeKey) {
      lastRouteKey.current = routeKey;
      machineRef.current?.navEnd();
    }
  }, [routeKey]);

  useEffect(() => {
    const machine = machineRef.current;
    if (!machine) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]');
      if (!anchor) return;
      if (
        isEligibleNavClick({
          href: anchor.getAttribute('href'),
          target: (anchor as HTMLAnchorElement).target ?? '',
          download: anchor.hasAttribute('download'),
          button: e.button,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          currentOrigin: window.location.origin,
          currentPath: window.location.pathname,
          currentSearch: window.location.search,
        })
      ) {
        machine.navStart();
      }
    };
    // Back/forward: uncached routes refetch and have the same dead gap; cached
    // ones commit within the 250ms delay and nothing ever shows.
    const onPop = () => machine.navStart();
    // Hard unloads (full page loads, downloads the predicate missed): the
    // browser takes over its own progress UI — get out of the way.
    const onPageHide = () => machine.destroy();

    document.addEventListener('click', onClick); // bubble phase — see header
    window.addEventListener('popstate', onPop);
    window.addEventListener('pagehide', onPageHide);
    const offBus = onNavStart(() => machine.navStart());

    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onPageHide);
      offBus();
      machine.destroy();
    };
  }, []);

  return (
    <>
      {/* Persistent polite live region: announcing from a node that already
          exists is reliable; mounting a new role="status" WITH its text often
          announces nothing. Empty when idle. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'hidden' ? '' : 'Loading page…'}
      </span>
      {state !== 'hidden' && (
        <div
          aria-hidden="true"
          data-state={state}
          className={cn(
            'cq-loader-veil fixed inset-0 z-[60] flex cursor-progress flex-col items-center justify-center',
            variant === 'full' ? 'bg-white/95' : 'bg-white',
            className,
          )}
        >
          <div className="cq-loader-markwrap w-[clamp(180px,30vw,260px)]">
            <BrandLoaderMark />
          </div>
          {/* Long-wait caption. Motion mode: fades in at 3s ("Still loading").
              Reduced motion: swapped for an immediate "Loading" — text is the
              activity signal when nothing moves. Both are visual-only; the
              live region above already announced. */}
          <p className="cq-loader-cap mt-7 text-[13px] font-medium tracking-[0.02em] text-[var(--color-fg-muted)]">
            <span className="cq-loader-cap-motion">Still loading</span>
            <span className="cq-loader-cap-static hidden">Loading</span>
          </p>
        </div>
      )}
    </>
  );
}
