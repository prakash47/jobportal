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

  // chip #13 — skill×city composed landings
  it('matches /<skill>-jobs-in-<city>', () => {
    expect(dispatch(['python-jobs-in-bangalore'])).toEqual({
      kind: 'skillCity',
      skill: 'python',
      city: 'bangalore',
    });
  });

  it('multi-word skill in skill×city: /node-js-jobs-in-pune', () => {
    expect(dispatch(['node-js-jobs-in-pune'])).toEqual({
      kind: 'skillCity',
      skill: 'node-js',
      city: 'pune',
    });
  });

  it('multi-city in skill×city: /react-jobs-in-bangalore-and-mumbai', () => {
    expect(dispatch(['react-jobs-in-bangalore-and-mumbai'])).toEqual({
      kind: 'skillCity',
      skill: 'react',
      city: 'bangalore-and-mumbai',
    });
  });

  it('skill×city does NOT match the plain /-jobs suffix', () => {
    // Sanity: when the URL has -jobs-in- in the middle, the skill×city
    // arm wins; we don't fall through to the plain skill arm.
    const result = dispatch(['python-jobs-in-bangalore']);
    expect(result?.kind).toBe('skillCity');
  });

  it('skill×city requires non-empty skill AND non-empty city', () => {
    expect(dispatch(['-jobs-in-bangalore'])).toBeNull();
    expect(dispatch(['python-jobs-in-'])).toBeNull();
    expect(dispatch(['jobs-in-bangalore'])).not.toEqual(
      expect.objectContaining({ kind: 'skillCity' }),
    );
    // (The bare jobs-in- prefix is correctly handled by the city arm.)
  });

  it('working-at- still wins over a -jobs-in- middle marker', () => {
    // Defensive ordering test: even a URL like working-at-foo-jobs-in-bar
    // routes to workingAt (which will then 404 internally if parse fails).
    expect(dispatch(['working-at-foo-jobs-in-bar'])).toEqual({
      kind: 'workingAt',
      segment: 'foo-jobs-in-bar',
    });
  });
});
