import { describe, expect, it } from 'vitest';
import { arraysEqual, parseUserIds, setEqual } from './flag-edit-helpers';

describe('setEqual', () => {
  it('different lengths → false', () => {
    expect(setEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('same elements regardless of order → true', () => {
    expect(setEqual(['BASIC', 'PREMIUM'], ['PREMIUM', 'BASIC'])).toBe(true);
    expect(setEqual([12, 88, 401], [88, 12, 401])).toBe(true);
  });

  it('same length, different elements → false', () => {
    expect(setEqual([1, 2], [1, 3])).toBe(false);
  });

  it('empty arrays → true', () => {
    expect(setEqual([], [])).toBe(true);
  });
});

describe('arraysEqual', () => {
  it('order matters (cohorts case)', () => {
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(arraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });
});

describe('parseUserIds', () => {
  it('comma-separated → integer list', () => {
    expect(parseUserIds('12, 88, 401')).toEqual({ ids: [12, 88, 401], error: null });
  });

  it('whitespace-separated also works', () => {
    expect(parseUserIds('12\n88 401')).toEqual({ ids: [12, 88, 401], error: null });
  });

  it('extra commas are tolerated', () => {
    expect(parseUserIds('12,, 88')).toEqual({ ids: [12, 88], error: null });
  });

  it('duplicates are removed (preserves first occurrence)', () => {
    expect(parseUserIds('12, 88, 12')).toEqual({ ids: [12, 88], error: null });
  });

  it('non-integer rejected with the offending token in the message', () => {
    expect(parseUserIds('12, abc, 88').error).toMatch(/abc/);
  });

  it('decimal rejected', () => {
    expect(parseUserIds('12.5').error).toMatch(/12\.5/);
  });

  it('zero rejected (positive ints only)', () => {
    expect(parseUserIds('0').error).toMatch(/0/);
  });

  it('negative rejected', () => {
    expect(parseUserIds('-5').error).toMatch(/-5/);
  });

  it('empty input → empty list (clears the target list)', () => {
    expect(parseUserIds('   ')).toEqual({ ids: [], error: null });
  });
});
