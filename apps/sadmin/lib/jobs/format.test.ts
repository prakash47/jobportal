import { describe, expect, it } from 'vitest';
import {
  formatDateIst,
  formatExperience,
  formatKycStatus,
  formatSalaryLpa,
  formatWaiting,
  waitingDays,
} from './format';

const NOW = new Date('2026-07-29T12:00:00Z');

describe('waitingDays', () => {
  it('floors rather than rounding up', () => {
    // Submitted 4 hours ago: it has not waited a day, and a queue that
    // overstates its own backlog is worse than one that understates it.
    expect(waitingDays(new Date('2026-07-29T08:00:00Z'), NOW)).toBe(0);
    expect(waitingDays(new Date('2026-07-28T11:00:00Z'), NOW)).toBe(1);
    expect(waitingDays(new Date('2026-07-26T12:00:00Z'), NOW)).toBe(3);
  });

  it('accepts the ISO strings the API actually returns', () => {
    expect(waitingDays('2026-07-26T12:00:00.000Z', NOW)).toBe(3);
  });

  // A row that entered the queue before this column existed.
  it('returns null for a missing timestamp', () => {
    expect(waitingDays(null, NOW)).toBeNull();
  });

  it('returns null for an unparseable value rather than NaN days', () => {
    expect(waitingDays('not-a-date', NOW)).toBeNull();
  });

  // Clock skew between the API host and this one must not render "-0 days".
  it('clamps a future timestamp to zero', () => {
    expect(waitingDays(new Date('2026-07-30T12:00:00Z'), NOW)).toBe(0);
  });
});

describe('formatWaiting', () => {
  it.each([
    [0, 'Today'],
    [1, '1 day'],
    [5, '5 days'],
    [null, 'Unknown'],
  ])('%p → %s', (days, expected) => {
    expect(formatWaiting(days)).toBe(expected);
  });
});

describe('formatSalaryLpa', () => {
  // Paise, not rupees: 1 LPA = 100,000 rupees = 10,000,000 paise.
  it('converts paise to LPA', () => {
    expect(formatSalaryLpa(80_000_000, 120_000_000)).toBe('₹8 – ₹12 LPA');
  });

  it('drops a trailing .0 but keeps a real decimal', () => {
    expect(formatSalaryLpa(75_000_000, 75_000_000)).toBe('₹7.5 LPA');
  });

  it('collapses an equal band to a single figure', () => {
    expect(formatSalaryLpa(80_000_000, 80_000_000)).toBe('₹8 LPA');
  });

  // A floor and a ceiling mean opposite things. This test previously asserted
  // "₹12+ LPA" for a max-only band — baking the bug in, so the suite endorsed a
  // console that told reviewers a job paid AT LEAST what it actually caps at.
  it('distinguishes a floor from a ceiling', () => {
    expect(formatSalaryLpa(80_000_000, null)).toBe('₹8+ LPA');
    expect(formatSalaryLpa(null, 120_000_000)).toBe('Up to ₹12 LPA');
  });

  // Cross-checks the sadmin console against what the candidate sees for the same
  // row: apps/web renders a max-only band as "Up to ₹12 LPA".
  it('agrees with the seeker-facing formatter on the direction of a one-sided band', () => {
    expect(formatSalaryLpa(null, 120_000_000)?.startsWith('Up to')).toBe(true);
    expect(formatSalaryLpa(120_000_000, null)?.endsWith('+ LPA')).toBe(true);
  });

  // The Job model has no "confidential" flag, so both-null means undisclosed and
  // the caller must say so in words rather than render an empty range.
  it('returns null when nothing is disclosed', () => {
    expect(formatSalaryLpa(null, null)).toBeNull();
  });

  it('does not treat a zero floor as absent', () => {
    expect(formatSalaryLpa(0, 50_000_000)).toBe('₹0 – ₹5 LPA');
  });
});

describe('formatExperience', () => {
  it.each([
    [2, 5, '2 – 5 yrs'],
    [3, 3, '3 yrs'],
    [2, null, '2+ yrs'],
    [null, 5, 'Up to 5 yrs'],
    [null, null, null],
  ])('(%p, %p) → %p', (min, max, expected) => {
    expect(formatExperience(min, max)).toBe(expected);
  });

  // Fresher roles store 0, which must not be mistaken for "not set".
  it('renders a zero minimum', () => {
    expect(formatExperience(0, 2)).toBe('0 – 2 yrs');
  });
});

describe('formatDateIst', () => {
  // India is UTC+5:30, so a late-evening UTC instant is already the next day in
  // IST. Rendering in UTC would misdate every evening submission.
  it('renders in IST, not UTC', () => {
    expect(formatDateIst('2026-07-29T19:00:00Z')).toBe('30 Jul 2026');
  });

  it('handles null and garbage without throwing', () => {
    expect(formatDateIst(null)).toBe('—');
    expect(formatDateIst('nope')).toBe('—');
  });
});

describe('formatKycStatus', () => {
  it('speaks the reviewer language, not the enum', () => {
    expect(formatKycStatus('VERIFIED')).toBe('Verified');
    expect(formatKycStatus('NOT_SUBMITTED')).toBe('Not verified');
  });

  // KycStatus could gain a value; an unknown one must not render raw.
  it('falls back safely for an unknown value', () => {
    expect(formatKycStatus('SOMETHING_NEW')).toBe('Not verified');
  });
});
