import { describe, expect, it } from 'vitest';
import { computeCompleteness, type CompletenessInput } from './completeness';

const empty: CompletenessInput = {
  name: null,
  phone: null,
  headline: null,
  summary: null,
  experienceMonths: null,
  currentTitle: null,
  currentCompanyId: null,
  expectedSalaryMinPaise: null,
  noticePeriodDays: null,
  preferredCityIds: [],
  skillIds: [],
  educationCount: 0,
  experienceCount: 0,
  hasActiveResume: false,
};

describe('computeCompleteness', () => {
  it('zero for an empty profile', () => {
    expect(computeCompleteness(empty)).toBe(0);
  });

  it('100 for a fully populated profile', () => {
    const full: CompletenessInput = {
      name: 'Prakash Mishra',
      phone: '+91 99999 99999',
      headline: 'Senior Engineer',
      summary: 'A long bio',
      experienceMonths: 60,
      currentTitle: 'Staff Engineer',
      currentCompanyId: 1,
      expectedSalaryMinPaise: 1_000_000_00,
      noticePeriodDays: 30,
      preferredCityIds: [1, 2],
      skillIds: [1, 2, 3, 4, 5],
      educationCount: 1,
      experienceCount: 2,
      hasActiveResume: true,
    };
    expect(computeCompleteness(full)).toBe(100);
  });

  it('partial: just name + headline + 1 skill', () => {
    expect(
      computeCompleteness({
        ...empty,
        name: 'Prakash',
        headline: 'Engineer',
        skillIds: [1],
      }),
    ).toBe(5 + 10 + 5);
  });

  it('rewards 3+ skills more than 1-2 skills', () => {
    const oneSkill = computeCompleteness({ ...empty, skillIds: [1] });
    const twoSkills = computeCompleteness({ ...empty, skillIds: [1, 2] });
    const threeSkills = computeCompleteness({ ...empty, skillIds: [1, 2, 3] });
    expect(oneSkill).toBe(5);
    expect(twoSkills).toBe(5);
    expect(threeSkills).toBe(15);
  });

  it('treats whitespace-only strings as empty', () => {
    expect(computeCompleteness({ ...empty, name: '   ' })).toBe(0);
  });

  it('clamps to 0..100 and never overflows', () => {
    // Nothing in the table should add up past 100, but verify the clamp path.
    const overstuffed: CompletenessInput = {
      name: 'a',
      phone: 'a',
      headline: 'a',
      summary: 'a',
      experienceMonths: 60,
      currentTitle: 'a',
      currentCompanyId: 1,
      expectedSalaryMinPaise: 1,
      noticePeriodDays: 0,
      preferredCityIds: [1],
      skillIds: [1, 2, 3],
      educationCount: 1,
      experienceCount: 1,
      hasActiveResume: true,
    };
    expect(computeCompleteness(overstuffed)).toBe(100);
  });
});
