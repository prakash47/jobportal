import { describe, expect, it } from 'vitest';
import {
  experienceFreshness,
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

describe('experienceFreshness', () => {
  it('reports none when there is no work history', () => {
    expect(experienceFreshness([], NOW).state).toBe('none');
  });

  it('reports current for an ongoing role — nothing is missing', () => {
    const f = experienceFreshness(
      [span({ startDate: '2020-01-01T00:00:00.000Z', endDate: null, isCurrent: true })],
      NOW,
    );
    expect(f.state).toBe('current');
    expect(f.monthsSince).toBe(0);
  });

  it('reports fresh for a role that ended recently', () => {
    const f = experienceFreshness(
      [span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2026-06-07T00:00:00.000Z' })],
      NOW,
    );
    expect(f.state).toBe('fresh');
    expect(f.monthsSince).toBe(3);
  });

  it('reports STALE for the reported case — a history that stops in 2017', () => {
    // Completeness counts filled sections, not current ones, so this profile
    // scored as complete while ending nine years ago.
    const f = experienceFreshness(
      [span({ startDate: '2014-01-01T00:00:00.000Z', endDate: '2017-12-31T00:00:00.000Z' })],
      NOW,
    );
    expect(f.state).toBe('stale');
    expect(f.monthsSince).toBeGreaterThan(100);
    expect(f.lastEndedAt).toBe('2017-12-31T00:00:00.000Z');
  });

  it('uses the MOST RECENT role, not the first or the longest', () => {
    const f = experienceFreshness(
      [
        span({ startDate: '2010-01-01T00:00:00.000Z', endDate: '2012-01-01T00:00:00.000Z' }),
        span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2026-06-07T00:00:00.000Z' }),
        span({ startDate: '2014-01-01T00:00:00.000Z', endDate: '2016-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(f.state).toBe('fresh');
  });

  it('treats an ongoing career break as a current account of the present', () => {
    // Someone on a declared break has told us what they are doing now; nagging
    // them to update would be wrong.
    const f = experienceFreshness(
      [
        span({ startDate: '2014-01-01T00:00:00.000Z', endDate: '2017-12-31T00:00:00.000Z' }),
        span({
          startDate: '2018-01-01T00:00:00.000Z',
          endDate: null,
          isCurrent: true,
          isCareerBreak: true,
        }),
      ],
      NOW,
    );
    expect(f.state).toBe('current');
  });

  it('does not count a career break as the most recent ROLE', () => {
    const f = experienceFreshness(
      [
        span({ startDate: '2014-01-01T00:00:00.000Z', endDate: '2017-12-31T00:00:00.000Z' }),
        span({
          startDate: '2018-01-01T00:00:00.000Z',
          endDate: '2026-06-07T00:00:00.000Z',
          isCareerBreak: true,
        }),
      ],
      NOW,
    );
    expect(f.state).toBe('stale');
    expect(f.lastEndedAt).toBe('2017-12-31T00:00:00.000Z');
  });

  it('flips at the boundary', () => {
    const at6 = experienceFreshness(
      [span({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2026-03-07T00:00:00.000Z' })],
      NOW,
    );
    expect(at6.monthsSince).toBe(6);
    expect(at6.state).toBe('stale');
  });
});
