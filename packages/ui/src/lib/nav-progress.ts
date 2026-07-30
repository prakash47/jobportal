// Navigation-progress core for the Career Queue loader ("The Advance").
//
// Framework-free on purpose: @jobportal/ui has no `next` dependency, so the
// pieces that must know about the App Router (usePathname/useSearchParams/
// useRouter) live in a thin per-app wrapper, and everything testable lives
// here. Three exports:
//
//   1. NavProgressMachine — the timing state machine. Encodes the behavioural
//      contract the design pitch was approved on: nothing appears before
//      SHOW_DELAY_MS of genuine waiting; once visible the loader stays at
//      least MIN_VISIBLE_MS; the exit window is EXIT_MS; a failsafe force-
//      hides after FAILSAFE_MS so a lost navigation can never strand an
//      opaque veil over the app.
//   2. isEligibleNavClick — the pure predicate deciding whether an anchor
//      click is a same-app navigation worth signalling.
//   3. notifyNavStart/onNavStart — a module-level bus so the app wrappers can
//      signal programmatic navigations (router.push/replace) into whichever
//      NavigationProgress instance is currently mounted.

export const SHOW_DELAY_MS = 250;
export const MIN_VISIBLE_MS = 400;
export const EXIT_MS = 250;
export const FAILSAFE_MS = 15_000;

export type NavProgressPhase = 'idle' | 'armed' | 'shown' | 'exiting';

export interface NavProgressCallbacks {
  /** The delay elapsed with the navigation still pending — mount the veil. */
  onShow(): void;
  /** Navigation committed (and the min-visible floor passed) — play the exit. */
  onExit(): void;
  /** Exit finished (or failsafe fired) — unmount the veil. */
  onHide(): void;
}

// Injectable timers so the machine is unit-testable with fake time.
export interface NavProgressTimers {
  set(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
  now(): number;
}

const realTimers: NavProgressTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
  now: () => Date.now(),
};

export class NavProgressMachine {
  private phase: NavProgressPhase = 'idle';
  private shownAt = 0;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private failsafeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly cb: NavProgressCallbacks,
    private readonly timers: NavProgressTimers = realTimers,
  ) {}

  getPhase(): NavProgressPhase {
    return this.phase;
  }

  /** A navigation just started (link click, router.push, popstate). */
  navStart(): void {
    // Re-navigation while the veil is up (or exiting) keeps the running loop —
    // a restarting arrow would read as the queue resetting (review graft).
    // Just refresh the failsafe; an exiting veil returns to fully shown.
    if (this.phase === 'shown' || this.phase === 'exiting') {
      if (this.phase === 'exiting') {
        this.clear('end');
        this.phase = 'shown';
        this.cb.onShow();
      }
      this.armFailsafe();
      return;
    }
    if (this.phase === 'armed') {
      // A second start while counting down: the wait is continuous from the
      // FIRST start (the user has been waiting the whole time) — keep the
      // original timer rather than pushing the veil further away.
      return;
    }
    this.phase = 'armed';
    this.showTimer = this.timers.set(() => {
      this.showTimer = null;
      this.phase = 'shown';
      this.shownAt = this.timers.now();
      this.cb.onShow();
    }, SHOW_DELAY_MS);
    this.armFailsafe();
  }

  /** The route committed (pathname/search changed). */
  navEnd(): void {
    if (this.phase === 'armed') {
      // Fast navigation: the veil never appeared, and never will.
      this.clear('show');
      this.clear('failsafe');
      this.phase = 'idle';
      return;
    }
    if (this.phase !== 'shown') return;
    this.clear('failsafe');
    const visibleFor = this.timers.now() - this.shownAt;
    const wait = Math.max(0, MIN_VISIBLE_MS - visibleFor);
    this.phase = 'exiting';
    this.endTimer = this.timers.set(() => {
      this.cb.onExit();
      this.endTimer = this.timers.set(() => {
        this.endTimer = null;
        this.phase = 'idle';
        this.cb.onHide();
      }, EXIT_MS);
    }, wait);
  }

  /** Unmount cleanup. */
  destroy(): void {
    this.clear('show');
    this.clear('end');
    this.clear('failsafe');
    this.phase = 'idle';
  }

  private armFailsafe(): void {
    this.clear('failsafe');
    this.failsafeTimer = this.timers.set(() => {
      // The navigation died somewhere (error page that never changed the URL,
      // aborted fetch, dev-server crash). Whatever the phase, get out of the
      // user's way immediately.
      this.failsafeTimer = null;
      this.clear('show');
      this.clear('end');
      const wasShown = this.phase === 'shown' || this.phase === 'exiting';
      this.phase = 'idle';
      if (wasShown) this.cb.onHide();
    }, FAILSAFE_MS);
  }

  private clear(which: 'show' | 'end' | 'failsafe'): void {
    const key = which === 'show' ? 'showTimer' : which === 'end' ? 'endTimer' : 'failsafeTimer';
    const id = this[key];
    if (id !== null) {
      this.timers.clear(id);
      this[key] = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Click eligibility
// ---------------------------------------------------------------------------

export interface NavClickInfo {
  /** Raw href attribute value (may be relative); null if absent. */
  href: string | null;
  /** The anchor's `target` attribute ('' when unset). */
  target: string;
  /** Whether the anchor carries a `download` attribute. */
  download: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** window.location.origin */
  currentOrigin: string;
  /** window.location.pathname (basePath INCLUDED — as the browser sees it). */
  currentPath: string;
  /** window.location.search ('' when none). */
  currentSearch: string;
}

/**
 * Should this anchor click start the loader? True only for a primary-button,
 * unmodified click on a same-origin http(s) link that actually changes the
 * page (not hash-only, not the identical URL — the App Router still handles
 * those, but the route key would never change and the veil would hang until
 * the failsafe).
 */
export function isEligibleNavClick(info: NavClickInfo): boolean {
  if (info.button !== 0) return false;
  if (info.metaKey || info.ctrlKey || info.shiftKey || info.altKey) return false;
  if (info.download) return false;
  if (info.target && info.target !== '_self') return false;
  if (!info.href) return false;

  let url: URL;
  try {
    url = new URL(info.href, `${info.currentOrigin}${info.currentPath}${info.currentSearch}`);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== info.currentOrigin) return false;
  // Same document position (ignoring hash) → the router will not stream a new
  // page; starting the loader would strand it.
  if (url.pathname === info.currentPath && url.search === (info.currentSearch || '')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Programmatic-navigation bus (router.push/replace patched in app wrappers)
// ---------------------------------------------------------------------------

type NavStartListener = () => void;
const navStartListeners = new Set<NavStartListener>();

/** Signal a programmatic navigation into the mounted NavigationProgress. */
export function notifyNavStart(): void {
  for (const l of navStartListeners) l();
}

export function onNavStart(listener: NavStartListener): () => void {
  navStartListeners.add(listener);
  return () => {
    navStartListeners.delete(listener);
  };
}
