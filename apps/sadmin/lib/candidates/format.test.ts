import { describe, expect, it } from 'vitest';
import {
  candidatesHref,
  clampPage,
  firstParam,
  formatHeadline,
  initials,
  lastPageFor,
  normalizeQuery,
} from './format';

// Regression: `?q=a&q=b` used to reach `raw.trim()` on an ARRAY and throw
// `TypeError: raw.trim is not a function`, 500-ing the whole route. Reproduced
// in the dev server before the guard existed.
describe('firstParam', () => {
  it('passes a plain string through', () => {
    expect(firstParam('arjun')).toBe('arjun');
  });

  it('passes undefined through', () => {
    expect(firstParam(undefined)).toBeUndefined();
  });

  it('takes the FIRST value of a repeated param', () => {
    expect(firstParam(['arjun', 'priya'])).toBe('arjun');
  });

  // noUncheckedIndexedAccess makes `raw[0]` possibly-undefined, and an empty
  // array is what `?q=` can degrade to; it must not become the string "".
  it('returns undefined for an empty array', () => {
    expect(firstParam([])).toBeUndefined();
  });

  it('composes with normalizeQuery instead of throwing', () => {
    expect(() => normalizeQuery(firstParam(['  arjun  ', 'priya']))).not.toThrow();
    expect(normalizeQuery(firstParam(['  arjun  ', 'priya']))).toBe('arjun');
  });

  // The page routes ?page through here too, so the same repeated key cannot
  // reach clampPage as an array.
  it('composes with clampPage', () => {
    expect(clampPage(firstParam(['3', '9']))).toBe(3);
    expect(clampPage(firstParam([]))).toBe(1);
  });
});

describe('normalizeQuery', () => {
  // `?q=` and a missing `q` must fold to the SAME state, or the where-clause
  // branch, the empty-state copy and the href builder each have to remember to
  // treat '' specially — and one of them eventually will not.
  it.each([[undefined], [''], ['   '], ['\t\n ']])('returns undefined for %j', (raw) => {
    expect(normalizeQuery(raw)).toBeUndefined();
  });

  it('trims the ends', () => {
    expect(normalizeQuery('  arjun  ')).toBe('arjun');
  });

  // Postgres `contains` is a literal substring match, so "priya   sharma" would
  // otherwise miss a row stored as "priya sharma".
  it('collapses internal whitespace', () => {
    expect(normalizeQuery('  priya   sharma  ')).toBe('priya sharma');
  });

  // `q` reaches Postgres as a LIKE pattern on an unindexed column; an unbounded
  // string is an unbounded scan predicate. Truncate rather than reject so a
  // pasted paragraph still searches instead of erroring.
  it('caps the length at 100 characters', () => {
    const got = normalizeQuery('a'.repeat(150));
    expect(got).toHaveLength(100);
  });

  it('leaves an ordinary query untouched', () => {
    expect(normalizeQuery('arjun@example.in')).toBe('arjun@example.in');
  });
});

describe('candidatesHref', () => {
  // The default page is omitted so the canonical URL stays clean.
  it('omits page 1 and an absent query', () => {
    expect(candidatesHref(1)).toBe('/candidates');
    expect(candidatesHref(0)).toBe('/candidates');
  });

  it('emits page alone', () => {
    expect(candidatesHref(2)).toBe('/candidates?page=2');
  });

  it('emits the query alone', () => {
    expect(candidatesHref(1, 'arjun')).toBe('/candidates?q=arjun');
  });

  // Fixed order (q then page) so the pagination links and the over-range
  // redirect can never build two different URLs for the same state.
  it('emits the query BEFORE the page when both are present', () => {
    expect(candidatesHref(3, 'arjun')).toBe('/candidates?q=arjun&page=3');
  });

  // Paging while a search is active must not silently drop the filter.
  it('carries the query through every page', () => {
    expect(candidatesHref(2, 'priya')).toContain('q=priya');
  });

  // A raw '&' or '#' in the box would otherwise terminate the query string and
  // truncate the search server-side.
  it.each([
    ['arjun iyer', '/candidates?q=arjun+iyer'],
    ['a&b', '/candidates?q=a%26b'],
    ['a#b', '/candidates?q=a%23b'],
  ])('percent-encodes %j', (q, expected) => {
    expect(candidatesHref(1, q)).toBe(expected);
  });

  // basePath pin: Next prefixes '/sadmin' itself, so writing it here would
  // resolve to /sadmin/sadmin/candidates and 404. Same assertion the employer
  // list's href builder carries.
  it('is basePath-relative', () => {
    expect(candidatesHref(3, 'arjun').startsWith('/sadmin')).toBe(false);
  });
});

describe('formatHeadline', () => {
  // The whole Candidate row is absent for a seeker who has never opened
  // /profile — which is the majority case on a fresh database, not an edge one.
  it('returns an em dash when there is no candidate profile at all', () => {
    expect(formatHeadline(null)).toBe('—');
  });

  it('returns an em dash when both fields are null', () => {
    expect(formatHeadline({ headline: null, currentTitle: null })).toBe('—');
  });

  // The seeker's own self-description wins over the mechanical job title.
  it('prefers the headline', () => {
    expect(formatHeadline({ headline: 'React developer', currentTitle: 'SDE II' })).toBe(
      'React developer',
    );
  });

  it('falls back to the current title', () => {
    expect(formatHeadline({ headline: null, currentTitle: 'SDE II' })).toBe('SDE II');
  });

  // A headline of spaces is not a headline. Without the trim it would win the
  // precedence and render a blank cell.
  it('falls through a whitespace-only headline', () => {
    expect(formatHeadline({ headline: '   ', currentTitle: 'SDE II' })).toBe('SDE II');
  });

  it('returns an em dash when both fields are whitespace', () => {
    expect(formatHeadline({ headline: '  ', currentTitle: ' ' })).toBe('—');
  });

  it('trims the value it returns', () => {
    expect(formatHeadline({ headline: '  React developer  ', currentTitle: null })).toBe(
      'React developer',
    );
  });
});

describe('initials', () => {
  it.each([[''], ['   ']])('returns ? for a blank name (%j)', (name) => {
    expect(initials(name)).toBe('?');
  });

  it('uses the single initial of a one-word name', () => {
    expect(initials('Arjun')).toBe('A');
  });

  it('uses first and last initials', () => {
    expect(initials('Arjun Iyer')).toBe('AI');
  });

  // First + LAST, not first + second — "Arjun Kumar Iyer" is AI, not AK.
  it('skips middle names', () => {
    expect(initials('Arjun Kumar Iyer')).toBe('AI');
  });

  it('uppercases', () => {
    expect(initials('arjun iyer')).toBe('AI');
  });

  it('collapses irregular spacing', () => {
    expect(initials('  Arjun   Iyer  ')).toBe('AI');
  });

  // A blank User.name falls back to the email upstream, so this is what the
  // avatar actually receives for those rows.
  it('initials an email when that is the display name', () => {
    expect(initials('arjun@example.in')).toBe('A');
  });

  it('handles non-ASCII names', () => {
    expect(initials('अर्जुन अय्यर')).toBe('अअ');
  });
});

// clampPage and lastPageFor are RE-EXPORTED from ../employers/format rather than
// copied, and are fully covered by employers/format.test.ts. These are smoke
// assertions that the re-export is wired — if the module ever stops exporting
// them, this fails here instead of at the page's import site. Same shape as
// otp-sessions/format.test.ts.
describe('re-exported pagination helpers', () => {
  it('clampPage is reachable and clamps', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage('0')).toBe(1);
    expect(clampPage('abc')).toBe(1);
    expect(clampPage('3')).toBe(3);
  });

  it('lastPageFor is reachable and rounds up', () => {
    expect(lastPageFor(0, 20)).toBe(1);
    expect(lastPageFor(20, 20)).toBe(1);
    expect(lastPageFor(21, 20)).toBe(2);
  });
});
