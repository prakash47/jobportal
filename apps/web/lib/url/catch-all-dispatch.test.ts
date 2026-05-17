import { describe, expect, it } from 'vitest';
import { dispatch } from './catch-all-dispatch';

describe('[...path] catch-all dispatch', () => {
  it('matches /jobs-in-<city> to the city handler', () => {
    expect(dispatch(['jobs-in-bangalore'])).toEqual({
      kind: 'city',
      segment: 'bangalore',
    });
  });

  it('matches multi-city /jobs-in-<city>-and-<city>', () => {
    expect(dispatch(['jobs-in-bangalore-and-mumbai'])).toEqual({
      kind: 'city',
      segment: 'bangalore-and-mumbai',
    });
  });

  it('matches /<skill>-jobs to the skill handler', () => {
    expect(dispatch(['python-jobs'])).toEqual({
      kind: 'skill',
      segment: 'python',
    });
  });

  it('multi-word skill like /node-js-jobs', () => {
    // Slug-style skills with hyphens are preserved (the suffix is stripped only once).
    expect(dispatch(['node-js-jobs'])).toEqual({
      kind: 'skill',
      segment: 'node-js',
    });
  });

  it('matches /working-at-<slug>-<id> to the workingAt handler', () => {
    expect(dispatch(['working-at-acme-corp-12'])).toEqual({
      kind: 'workingAt',
      segment: 'acme-corp-12',
    });
  });

  // Order matters: working-at- is prefix-matched first, so the working-at-
  // branch wins even if the segment ALSO ends with -jobs. The inner handler
  // will then 404 via parseWorkingAtSlug if the rest doesn't parse.
  it('working-at- prefix wins over -jobs suffix when both match', () => {
    expect(dispatch(['working-at-acme-jobs'])).toEqual({
      kind: 'workingAt',
      segment: 'acme-jobs',
    });
  });

  it('returns null for paths deeper than one segment', () => {
    // The catch-all only handles single-segment SEO landings. Anything
    // deeper is genuinely not-found.
    expect(dispatch(['jobs-in-bangalore', 'something'])).toBeNull();
    expect(dispatch(['a', 'b', 'c'])).toBeNull();
  });

  it('returns null for empty path or undefined', () => {
    expect(dispatch([])).toBeNull();
    expect(dispatch(undefined)).toBeNull();
  });

  it('returns null for the bare prefixes / suffix (no payload)', () => {
    // length === '-jobs'.length, segment.length > '-jobs'.length must be false.
    expect(dispatch(['-jobs'])).toBeNull();
    expect(dispatch(['jobs-in-'])).toBeNull();
    expect(dispatch(['working-at-'])).toBeNull();
  });

  it('returns null for an unrelated bogus path', () => {
    expect(dispatch(['totally-unrelated-segment'])).toBeNull();
    expect(dispatch(['foo'])).toBeNull();
  });
});
