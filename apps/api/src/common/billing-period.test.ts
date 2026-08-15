import { describe, expect, it } from 'vitest';
import { addDays, extendFrom } from './billing-period';

describe('addDays', () => {
  it('adds whole days', () => {
    expect(addDays(new Date('2026-08-15T00:00:00.000Z'), 30).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z',
    );
  });

  it('preserves the time of day', () => {
    expect(addDays(new Date('2026-08-15T09:30:00.000Z'), 1).toISOString()).toBe(
      '2026-08-16T09:30:00.000Z',
    );
  });

  // Fixed duration, not calendar arithmetic: 30 days from 31 January is 2 March,
  // not "31 February clamped". A plan sells intervalDays, so this is the
  // intended reading — pinned because a future switch to a date library would
  // quietly change what every recruiter's renewal date means.
  it('crosses a month boundary as a fixed duration', () => {
    expect(addDays(new Date('2027-01-31T00:00:00.000Z'), 30).toISOString()).toBe(
      '2027-03-02T00:00:00.000Z',
    );
  });

  it('crosses a leap day without special-casing it', () => {
    expect(addDays(new Date('2028-02-28T00:00:00.000Z'), 1).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('does not mutate its argument', () => {
    const base = new Date('2026-08-15T00:00:00.000Z');
    addDays(base, 10);
    expect(base.toISOString()).toBe('2026-08-15T00:00:00.000Z');
  });
});

describe('extendFrom', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('extends a still-running subscription from its existing end', () => {
    const end = new Date('2026-08-25T00:00:00.000Z');
    expect(extendFrom(end, now)).toBe(end);
  });

  // The case the purchase path can never reach, and the reason this helper
  // exists: nothing in this product writes SubscriptionStatus.EXPIRED, so a
  // lapsed subscription still reads ACTIVE. Extending from its stored end would
  // spend the grant on time that has already passed — a 30-day comp on a
  // subscription that ended 40 days ago would leave it STILL expired.
  it('extends a lapsed subscription from now, not from its stale end', () => {
    const end = new Date('2026-07-06T00:00:00.000Z');
    expect(extendFrom(end, now)).toBe(now);
  });

  it('extends from now when the period ends exactly now', () => {
    expect(extendFrom(new Date(now.getTime()), now)).toBe(now);
  });

  it('composes with addDays to always land in the future', () => {
    const lapsed = new Date('2026-01-01T00:00:00.000Z');
    expect(addDays(extendFrom(lapsed, now), 30).getTime()).toBeGreaterThan(now.getTime());
  });
});
