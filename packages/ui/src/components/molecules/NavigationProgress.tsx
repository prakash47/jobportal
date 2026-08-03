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
// router.push/replace get patched onto the notifyNavStart bus (guarded by
// isSameDocumentNav so a push to the current URL never signals — it would
// never change the route key and would strand the veil). See
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
//   · popstate: only traversals that change path/search count. A Back over a
//     hash-only history entry (e.g. the #openings anchors on company pages)
//     restores the same document — no route-key change ever follows, so
//     starting the loader would strand it (review finding).
//
// INTERACTION: the veil is pointer-events-none — pure feedback, zero input
// interference. Blocking pointers while letting keyboard through (or blocking
// both) creates a modality this design rejects: it never touches focus, and a
// keyboard user and a mouse user get exactly the same page underneath
// (WCAG 2.2 keyboard-parity review finding). It announces politely via a
// persistent role="status" region: "Loading page…", then "Still loading" at
// 3s, and an honest "taking longer than expected" if the failsafe ever fires.
//
// LIFECYCLE: pagehide tears everything down (hard navigations hand feedback
// duty to the browser), and pageshow(persisted) resets again — a bfcache
// restore would otherwise resurrect a veil whose timers (including the
// failsafe) died with the pagehide (review finding).

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
  // Re-show while the exit fade is running: skip the entrance animation so the
  // veil snaps back to fully visible instead of blinking transparent first.
  const [revived, setRevived] = useState(false);
  // Long-wait caption mirror for the live region (the visual caption is
  // CSS-timed; screen readers need the same escalation announced).
  const [slow, setSlow] = useState(false);
  // Failsafe fired: the last announcement must not stay "Loading page…".
  const [lost, setLost] = useState(false);

  // Mirror of `state` readable from machine callbacks (they fire from timers,
  // after effects have flushed) without making a setState updater impure.
  const stateRef = useRef<VeilState>('hidden');
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const machineRef = useRef<NavProgressMachine | null>(null);
  if (machineRef.current === null) {
    machineRef.current = new NavProgressMachine({
      onShow: () => {
        setLost(false);
        setRevived(stateRef.current === 'exiting');
        setState('shown');
      },
      onExit: () => setState('exiting'),
      onHide: (reason) => {
        setState('hidden');
        setRevived(false);
        setSlow(false);
        if (reason === 'failsafe') setLost(true);
      },
    });
  }

  // Route committed → end the pending navigation. Skip the initial render
  // (mount is not a navigation). Also refresh the location key the popstate
  // guard compares against — window.location is already the committed URL by
  // the time this effect runs.
  const lastRouteKey = useRef(routeKey);
  const locKeyRef = useRef<string | null>(null);
  useEffect(() => {
    locKeyRef.current = `${window.location.pathname}${window.location.search}`;
    if (lastRouteKey.current !== routeKey) {
      lastRouteKey.current = routeKey;
      machineRef.current?.navEnd();
    }
  }, [routeKey]);

  // Screen-reader escalation at 3s of visible waiting.
  useEffect(() => {
    if (state !== 'shown') return;
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [state]);

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
    // ones commit within the 250ms delay and nothing ever shows. Hash-only
    // traversals restore the same document — never start for those.
    const onPop = () => {
      const key = `${window.location.pathname}${window.location.search}`;
      if (key === locKeyRef.current) return;
      machine.navStart();
    };
    const reset = () => {
      machine.destroy();
      setState('hidden');
      setRevived(false);
      setSlow(false);
      setLost(false);
    };
    // Hard unloads (full page loads, downloads the predicate missed): the
    // browser takes over its own progress UI — get out of the way, and clear
    // the React state too so a bfcache restore cannot resurrect a timerless
    // veil. pageshow(persisted) resets again, belt and braces.
    const onPageHide = () => reset();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset();
    };

    document.addEventListener('click', onClick); // bubble phase — see header
    window.addEventListener('popstate', onPop);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    const offBus = onNavStart(() => machine.navStart());

    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      offBus();
      machine.destroy();
    };
  }, []);

  const announcement =
    state === 'hidden'
      ? lost
        ? 'Loading is taking longer than expected. You can keep using the page.'
        : ''
      : slow
        ? 'Still loading'
        : 'Loading page…';

  return (
    <>
      {/* Persistent polite live region: announcing from a node that already
          exists is reliable; mounting a new role="status" WITH its text often
          announces nothing. Empty when idle. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {state !== 'hidden' && (
        <div
          aria-hidden="true"
          data-state={state}
          data-revived={revived ? 'true' : undefined}
          className={cn(
            'cq-loader-veil pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center',
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
              live region above carries the same escalation for AT. */}
          <p className="mt-7 text-[13px] font-medium tracking-[0.02em] text-[var(--color-fg-muted)]">
            <span className="cq-loader-cap-motion">Still loading</span>
            <span className="cq-loader-cap-static hidden">Loading</span>
          </p>
        </div>
      )}
    </>
  );
}
