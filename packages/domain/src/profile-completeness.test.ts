import { describe, expect, it } from 'vitest';
import {
  COMPLETENESS_TOTAL,
  completenessBreakdown,
  computeCompleteness,
  type CompletenessInput,
} from './profile-completeness';

// The bug this file exists to prevent: the dashboard used to compute the
// PERCENTAGE from one table (14 fields, in the API) and the CHECKLIST from a
// hand-written list of 5 items in the page. Finishing all 5 left 55 points
// unaccounted for, so the card cheerfully said "All sections filled in" at 94%.
// Everything below asserts the two can never disagree again.

const EMPTY: CompletenessInput = {
  name: null,
  phone: null,
  headline: null,
  summary: null,
  experienceMonths: null,
  currentTitle: null,
  currentCompanyId: null,
  currentCompanyName: null,
  expectedSalaryMinPaise: null,
  noticePeriodDays: null,
  preferredCityIds: [],
  skillIds: [],
  educationCount: 0,
  experienceCount: 0,
  hasActiveResume: false,
};

const FULL: CompletenessInput = {
  name: 'Arjun Iyer',
  phone: '+91 9876543210',
  headline: 'Staff Engineer',
  summary: 'Ten years building payments infrastructure.',
  experienceMonths: 132,
  currentTitle: 'Staff Engineer',
  currentCompanyId: 7,
  currentCompanyName: 'Sahaj Pay',
  expectedSalaryMinPaise: 700000000,
  noticePeriodDays: 60,
  preferredCityIds: [1, 2],
  skillIds: [1, 2, 3],
  educationCount: 1,
  experienceCount: 2,
  hasActiveResume: true,
};

describe('the score and the breakdown are the same calculation', () => {
  it('scores an empty profile 0 and a full one 100', () => {
    expect(computeCompleteness(EMPTY)).toBe(0);
    expect(computeCompleteness(FULL)).toBe(100);
  });

  it('the breakdown weights sum to exactly 100', () => {
    const total = completenessBreakdown(EMPTY).reduce((n, i) => n + i.points, 0);
    expect(total).toBe(COMPLETENESS_TOTAL);
    expect(total).toBe(100);
  });

  // THE regression. If these two ever diverge the card lies again.
  // NOTE the invariant is sum of EARNED, not sum of done-items' full points.
  // Partial credit makes those differ: one skill earns 5 of 15 while `done`
  // stays false, so a `filter(done)` sum silently loses those 5. Getting this
  // wrong the first time is what the failing assertion caught.
  it('the score always equals the sum of EARNED points', () => {
    const cases: CompletenessInput[] = [
      EMPTY,
      FULL,
      { ...FULL, currentCompanyId: null, currentCompanyName: null }, // the classic 94% profile
      { ...FULL, expectedSalaryMinPaise: null },
      { ...FULL, skillIds: [1] },
      { ...FULL, phone: null, summary: null },
      { ...EMPTY, name: 'A', skillIds: [1, 2, 3], hasActiveResume: true },
    ];
    for (const c of cases) {
      const earned = completenessBreakdown(c).reduce((n, i) => n + i.earned, 0);
      expect(earned).toBe(computeCompleteness(c));
      // And a done item must always have earned its full weight.
      for (const i of completenessBreakdown(c)) {
        if (i.done) expect(i.earned).toBe(i.points);
      }
    }
  });

  // The reported symptom, pinned as a test.
  it('a profile below 100 always has at least one incomplete item to show', () => {
    const almost: CompletenessInput = { ...FULL, currentCompanyId: null, currentCompanyName: null };
    const score = computeCompleteness(almost);
    expect(score).toBe(94);
    const remaining = completenessBreakdown(almost).filter((i) => !i.done);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.map((i) => i.key)).toContain('currentCompany');
  });

  it('only a 100% profile has nothing remaining', () => {
    expect(completenessBreakdown(FULL).filter((i) => !i.done)).toHaveLength(0);
    expect(completenessBreakdown(EMPTY).filter((i) => !i.done)).toHaveLength(
      completenessBreakdown(EMPTY).length,
    );
  });
});

describe('partial credit is reported honestly', () => {
  // The second, quieter half of the bug: the old checklist ticked "skills" at
  // one skill, but the scorer only pays full marks at three - so the user saw a
  // tick and silently lost 10 points with no way to discover why.
  it('marks skills incomplete until the full weight is earned', () => {
    const one = completenessBreakdown({ ...EMPTY, skillIds: [1] }).find((i) => i.key === 'skills');
    const three = completenessBreakdown({ ...EMPTY, skillIds: [1, 2, 3] }).find(
      (i) => i.key === 'skills',
    );
    expect(one?.done).toBe(false);
    expect(one?.earned).toBe(5);
    expect(one?.points).toBe(15);
    expect(three?.done).toBe(true);
    expect(three?.earned).toBe(15);
  });

  it('counts the partial skill credit toward the score', () => {
    expect(computeCompleteness({ ...EMPTY, skillIds: [1] })).toBe(5);
    expect(computeCompleteness({ ...EMPTY, skillIds: [1, 2, 3] })).toBe(15);
  });
});

describe('every item is actionable', () => {
  it('gives each item a human label and a stable key', () => {
    for (const item of completenessBreakdown(EMPTY)) {
      expect(item.key).toMatch(/^[a-zA-Z]+$/);
      expect(item.label.length).toBeGreaterThan(3);
      expect(item.points).toBeGreaterThan(0);
    }
  });

  it('has unique keys', () => {
    const keys = completenessBreakdown(EMPTY).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('clamping', () => {
  it('never exceeds 100 or drops below 0', () => {
    expect(computeCompleteness({ ...FULL, skillIds: [1, 2, 3, 4, 5, 6] })).toBe(100);
    expect(computeCompleteness({ ...EMPTY, experienceMonths: -5 })).toBe(0);
  });
});

// The row was unearnable before this: it scored the `currentCompanyId` FK, which
// NOTHING in the product writes. Onboarding writes the free-text
// `currentCompanyName` instead. Measured on the dev database at the time: 36
// candidates, 0 with an id, 1 with a name — so every user was capped below 100
// by a row they could never clear.
describe('current company is earnable by the column users actually set', () => {
  it('credits the free-text company name on its own', () => {
    const viaName = { ...EMPTY, currentCompanyName: 'Sahaj Pay' };
    const item = completenessBreakdown(viaName).find((i) => i.key === 'currentCompany');
    expect(item?.done).toBe(true);
    expect(computeCompleteness(viaName)).toBe(6);
  });

  it('still credits the FK if anything ever writes it', () => {
    const viaId = { ...EMPTY, currentCompanyId: 7 };
    expect(completenessBreakdown(viaId).find((i) => i.key === 'currentCompany')?.done).toBe(true);
  });

  it('treats whitespace as absent, like every other text field', () => {
    const blank = { ...EMPTY, currentCompanyName: '   ' };
    expect(completenessBreakdown(blank).find((i) => i.key === 'currentCompany')?.done).toBe(false);
  });

  // Reaching 100 must be possible via the route a real user actually has.
  it('a profile filled entirely through the real UI reaches 100', () => {
    const reachable: CompletenessInput = { ...FULL, currentCompanyId: null };
    expect(computeCompleteness(reachable)).toBe(100);
    expect(completenessBreakdown(reachable).filter((i) => !i.done)).toHaveLength(0);
  });
});
