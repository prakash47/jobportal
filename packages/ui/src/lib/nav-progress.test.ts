import { describe, expect, it } from 'vitest';
import {
  EXIT_MS,
  FAILSAFE_MS,
  MIN_VISIBLE_MS,
  NavProgressMachine,
  SHOW_DELAY_MS,
  isEligibleNavClick,
  notifyNavStart,
  onNavStart,
  type NavClickInfo,
  type NavProgressTimers,
} from './nav-progress';

// ---------------------------------------------------------------------------
// Fake clock: deterministic, manually advanced.
// ---------------------------------------------------------------------------
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: NavProgressTimers = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear: (id) => {
      pending.delete(id as unknown as number);
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    const target = now + ms;
    // fire due timers in time order, allowing timers scheduled by callbacks
    for (;;) {
      const due = [...pending.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due;
      pending.delete(id);
      now = t.at;
      t.fn();
    }
    now = target;
  };
  return { timers, advance, pendingCount: () => pending.size };
}

function harness() {
  const clock = fakeClock();
  const log: string[] = [];
  const machine = new NavProgressMachine(
    {
      onShow: () => log.push('show'),
      onExit: () => log.push('exit'),
      onHide: () => log.push('hide'),
    },
    clock.timers,
  );
  return { ...clock, log, machine };
}

describe('NavProgressMachine', () => {
  it('shows only after the 250ms delay', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(SHOW_DELAY_MS - 1);
    expect(h.log).toEqual([]);
    h.advance(1);
    expect(h.log).toEqual(['show']);
    expect(h.machine.getPhase()).toBe('shown');
  });

  it('a fast navigation never shows anything', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(100);
    h.machine.navEnd();
    h.advance(10_000);
    expect(h.log).toEqual([]);
    expect(h.machine.getPhase()).toBe('idle');
    expect(h.pendingCount()).toBe(0); // no timer leaks
  });

  it('honours the 400ms min-visible floor when commit lands just after show', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(SHOW_DELAY_MS + 50); // visible for 50ms
    h.machine.navEnd();
    expect(h.log).toEqual(['show']);
    h.advance(MIN_VISIBLE_MS - 50 - 1);
    expect(h.log).toEqual(['show']); // still holding
    h.advance(1);
    expect(h.log).toEqual(['show', 'exit']);
    h.advance(EXIT_MS);
    expect(h.log).toEqual(['show', 'exit', 'hide']);
  });

  it('exits immediately (no extra hold) when already visible past the floor', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(SHOW_DELAY_MS + MIN_VISIBLE_MS + 500);
    h.machine.navEnd();
    // wait of 0 → exit fires on the next tick of the fake clock
    h.advance(0);
    expect(h.log).toEqual(['show', 'exit']);
    h.advance(EXIT_MS);
    expect(h.log).toEqual(['show', 'exit', 'hide']);
  });

  it('a second navStart while armed keeps the ORIGINAL show timer', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(200);
    h.machine.navStart(); // e.g. double click
    h.advance(50); // 250ms from the FIRST start
    expect(h.log).toEqual(['show']);
  });

  it('re-navigation while shown keeps the loop running (no hide/remount)', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(SHOW_DELAY_MS + 100);
    h.machine.navStart(); // user clicked another link mid-wait
    h.advance(5_000);
    expect(h.log).toEqual(['show']); // exactly one show, never hidden
    h.machine.navEnd();
    h.advance(MIN_VISIBLE_MS + EXIT_MS);
    expect(h.log).toEqual(['show', 'exit', 'hide']);
  });

  it('navStart during the exit window revives the veil instead of remounting', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(SHOW_DELAY_MS + MIN_VISIBLE_MS);
    h.machine.navEnd();
    h.advance(0); // exit begins
    expect(h.log).toEqual(['show', 'exit']);
    h.machine.navStart(); // immediate next navigation
    expect(h.machine.getPhase()).toBe('shown');
    expect(h.log).toEqual(['show', 'exit', 'show']);
    // and the interrupted exit's hide must never fire
    h.advance(EXIT_MS + 100);
    expect(h.log).toEqual(['show', 'exit', 'show']);
  });

  it('failsafe force-hides a stranded veil', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(FAILSAFE_MS);
    expect(h.log).toEqual(['show', 'hide']);
    expect(h.machine.getPhase()).toBe('idle');
  });

  it('failsafe on a never-shown (armed) navigation stays silent', () => {
    const h = harness();
    const local = fakeClock();
    const log: string[] = [];
    const m = new NavProgressMachine(
      { onShow: () => log.push('show'), onExit: () => log.push('exit'), onHide: () => log.push('hide') },
      local.timers,
    );
    m.navStart();
    m.navEnd(); // committed fast…
    local.advance(FAILSAFE_MS + 1000);
    expect(log).toEqual([]); // …so the failsafe was disarmed with it
    void h;
  });

  it('re-navigation refreshes the failsafe', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(FAILSAFE_MS - 1000);
    h.machine.navStart(); // still waiting, user re-clicked
    h.advance(1000);
    expect(h.log).toEqual(['show']); // old failsafe must NOT fire at the original deadline
    h.advance(FAILSAFE_MS - 1000);
    expect(h.log).toEqual(['show', 'hide']); // refreshed one fires
  });

  it('destroy clears every timer', () => {
    const h = harness();
    h.machine.navStart();
    h.advance(100);
    h.machine.destroy();
    h.advance(60_000);
    expect(h.log).toEqual([]);
    expect(h.pendingCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isEligibleNavClick
// ---------------------------------------------------------------------------
const base: NavClickInfo = {
  href: '/jobs',
  target: '',
  download: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  currentOrigin: 'http://localhost:3000',
  currentPath: '/',
  currentSearch: '',
};

describe('isEligibleNavClick', () => {
  it('accepts a plain same-origin link to another page', () => {
    expect(isEligibleNavClick(base)).toBe(true);
  });

  it('accepts a relative link with a query string', () => {
    expect(isEligibleNavClick({ ...base, href: '/jobs?city=bangalore' })).toBe(true);
  });

  it('rejects modified clicks (new-tab intents)', () => {
    expect(isEligibleNavClick({ ...base, ctrlKey: true })).toBe(false);
    expect(isEligibleNavClick({ ...base, metaKey: true })).toBe(false);
    expect(isEligibleNavClick({ ...base, shiftKey: true })).toBe(false);
    expect(isEligibleNavClick({ ...base, altKey: true })).toBe(false);
    expect(isEligibleNavClick({ ...base, button: 1 })).toBe(false);
  });

  it('rejects target=_blank but allows explicit _self', () => {
    expect(isEligibleNavClick({ ...base, target: '_blank' })).toBe(false);
    expect(isEligibleNavClick({ ...base, target: '_self' })).toBe(true);
  });

  it('rejects downloads, cross-origin, and non-http schemes', () => {
    expect(isEligibleNavClick({ ...base, download: true })).toBe(false);
    expect(isEligibleNavClick({ ...base, href: 'https://example.com/jobs' })).toBe(false);
    expect(isEligibleNavClick({ ...base, href: 'mailto:hi@careerqueue.in' })).toBe(false);
    expect(isEligibleNavClick({ ...base, href: 'tel:+911234567890' })).toBe(false);
  });

  it('rejects the API origin (cross-origin in dev)', () => {
    expect(isEligibleNavClick({ ...base, href: 'http://localhost:4000/media/logo.png' })).toBe(false);
  });

  it('rejects hash-only and identical-URL links (the veil would hang)', () => {
    expect(isEligibleNavClick({ ...base, href: '#apply-form' })).toBe(false);
    expect(isEligibleNavClick({ ...base, href: '/' })).toBe(false);
    expect(
      isEligibleNavClick({ ...base, currentPath: '/jobs', currentSearch: '?city=pune', href: '/jobs?city=pune' }),
    ).toBe(false);
  });

  it('accepts a same-path link whose query differs (SRP filter change)', () => {
    expect(
      isEligibleNavClick({ ...base, currentPath: '/jobs', currentSearch: '?city=pune', href: '/jobs?city=mumbai' }),
    ).toBe(true);
  });

  it('rejects a missing href', () => {
    expect(isEligibleNavClick({ ...base, href: null })).toBe(false);
  });
});

describe('nav-start bus', () => {
  it('delivers to subscribers and stops after unsubscribe', () => {
    let calls = 0;
    const off = onNavStart(() => {
      calls += 1;
    });
    notifyNavStart();
    expect(calls).toBe(1);
    off();
    notifyNavStart();
    expect(calls).toBe(1);
  });
});
