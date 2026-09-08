import { describe, expect, it } from 'vitest';
import {
  formatExperience,
  sortExperience,
  totalExperienceMonths,
  type ExperienceSpan,
} from './experience';

const NOW = new Date('2026-09-07T00:00:00.000Z');

const span = (over: Partial<ExperienceSpan> = {}): ExperienceSpan => ({
  startDate: '2020-01-01T00:00:00.000Z',
  endDate: '2022-01-01T00:00:00.000Z',
  isCurrent: false,
  isCareerBreak: false,
  ...over,
});

describe('totalExperienceMonths', () => {
  it('is zero with no rows', () => {
    expect(totalExperienceMonths([], NOW)).toBe(0);
  });

  it('counts a closed role', () => {
    expect(totalExperienceMonths([span()], NOW)).toBe(24);
  });

  it('counts a current role up to today', () => {
    const months = totalExperienceMonths(
      [span({ startDate: '2024-09-07T00:00:00.000Z', endDate: null, isCurrent: true })],
      NOW,
    );
    expect(months).toBe(24);
  });

  it('adds non-overlapping roles', () => {
    const months = totalExperienceMonths(
      [
        span({ startDate: '2018-01-01T00:00:00.000Z', endDate: '2019-01-01T00:00:00.000Z' }),
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(months).toBe(24);
  });

  it('MERGES overlapping roles instead of double-counting them', () => {
    // Two concurrent roles across the same two years is two years of
    // experience, not four. Summing would tell a recruiter a number they check.
    const months = totalExperienceMonths(
      [
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2022-01-01T00:00:00.000Z' }),
        span({ startDate: '2020-06-01T00:00:00.000Z', endDate: '2021-06-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(months).toBe(24);
  });

  it('extends a merged interval when the second role runs longer', () => {
    const months = totalExperienceMonths(
      [
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' }),
        span({ startDate: '2020-06-01T00:00:00.000Z', endDate: '2022-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(months).toBe(24);
  });

  it('merges touching intervals without a gap', () => {
    const months = totalExperienceMonths(
      [
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' }),
        span({ startDate: '2021-01-01T00:00:00.000Z', endDate: '2022-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(months).toBe(24);
  });

  it('is order-independent', () => {
    const a = span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2022-01-01T00:00:00.000Z' });
    const b = span({ startDate: '2018-01-01T00:00:00.000Z', endDate: '2019-01-01T00:00:00.000Z' });
    expect(totalExperienceMonths([a, b], NOW)).toBe(totalExperienceMonths([b, a], NOW));
  });

  it('EXCLUDES career breaks — a break is context, not experience', () => {
    const withBreak = totalExperienceMonths(
      [
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2022-01-01T00:00:00.000Z' }),
        span({
          startDate: '2022-01-01T00:00:00.000Z',
          endDate: '2023-01-01T00:00:00.000Z',
          isCareerBreak: true,
        }),
      ],
      NOW,
    );
    expect(withBreak).toBe(24);
  });

  it('ignores a row whose end precedes its start', () => {
    const months = totalExperienceMonths(
      [span({ startDate: '2022-01-01T00:00:00.000Z', endDate: '2020-01-01T00:00:00.000Z' })],
      NOW,
    );
    expect(months).toBe(0);
  });

  it('does not inflate the total for a row with no end and no current flag', () => {
    const months = totalExperienceMonths(
      [span({ startDate: '2020-01-01T00:00:00.000Z', endDate: null, isCurrent: false })],
      NOW,
    );
    expect(months).toBe(0);
  });

  it('skips an unparseable date rather than returning NaN', () => {
    const months = totalExperienceMonths([span({ startDate: 'not a date' })], NOW);
    expect(months).toBe(0);
    expect(Number.isNaN(months)).toBe(false);
  });
});

describe('formatExperience', () => {
  it('renders years and months', () => {
    expect(formatExperience(66)).toBe('5 yrs 6 mos');
  });

  it('omits a zero part', () => {
    expect(formatExperience(24)).toBe('2 yrs');
    expect(formatExperience(7)).toBe('7 mos');
  });

  it('singularises', () => {
    expect(formatExperience(12)).toBe('1 yr');
    expect(formatExperience(13)).toBe('1 yr 1 mo');
  });

  it('handles zero and negatives', () => {
    expect(formatExperience(0)).toBe('0 mos');
    expect(formatExperience(-5)).toBe('0 mos');
  });
});

describe('sortExperience', () => {
  const rows = [
    { id: 1, startDate: '2018-01-01T00:00:00.000Z', isCurrent: false },
    { id: 2, startDate: '2024-01-01T00:00:00.000Z', isCurrent: true },
    { id: 3, startDate: '2021-01-01T00:00:00.000Z', isCurrent: false },
  ];

  it('puts current roles first, then newest start', () => {
    expect(sortExperience(rows).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate the input', () => {
    const before = rows.map((r) => r.id);
    sortExperience(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
