import { describe, expect, it } from 'vitest';
import { lowercasePath, normalizeQuery, sortMultiCitySegment, stripTrailingSlash } from './normalize';

describe('lowercasePath', () => {
  it('lowercases and reports change', () => {
    expect(lowercasePath('/Jobs-In-Bangalore')).toEqual({
      pathname: '/jobs-in-bangalore',
      changed: true,
    });
  });
  it('reports no change when already lowercase', () => {
    expect(lowercasePath('/jobs-in-bangalore')).toEqual({
      pathname: '/jobs-in-bangalore',
      changed: false,
    });
  });
});

describe('stripTrailingSlash', () => {
  it('strips a trailing slash', () => {
    expect(stripTrailingSlash('/jobs-in-pune/')).toEqual({
      pathname: '/jobs-in-pune',
      changed: true,
    });
  });
  it('leaves the root alone', () => {
    expect(stripTrailingSlash('/')).toEqual({ pathname: '/', changed: false });
  });
  it('reports no change when no trailing slash', () => {
    expect(stripTrailingSlash('/jobs-in-pune')).toEqual({
      pathname: '/jobs-in-pune',
      changed: false,
    });
  });
  it('strips multiple trailing slashes', () => {
    expect(stripTrailingSlash('/foo///')).toEqual({ pathname: '/foo', changed: true });
  });
});

describe('sortMultiCitySegment', () => {
  it('sorts unsorted multi-city', () => {
    expect(sortMultiCitySegment('/jobs-in-pune-and-bangalore')).toEqual({
      pathname: '/jobs-in-bangalore-and-pune',
      changed: true,
    });
  });
  it('leaves already-sorted multi-city alone', () => {
    expect(sortMultiCitySegment('/jobs-in-bangalore-and-pune')).toEqual({
      pathname: '/jobs-in-bangalore-and-pune',
      changed: false,
    });
  });
  it('handles 3+ cities', () => {
    expect(sortMultiCitySegment('/jobs-in-mumbai-and-pune-and-bangalore')).toEqual({
      pathname: '/jobs-in-bangalore-and-mumbai-and-pune',
      changed: true,
    });
  });
  it('leaves single-city paths alone', () => {
    expect(sortMultiCitySegment('/jobs-in-bangalore')).toEqual({
      pathname: '/jobs-in-bangalore',
      changed: false,
    });
  });
  it('handles skill-prefixed paths', () => {
    expect(sortMultiCitySegment('/python-jobs-in-pune-and-bangalore')).toEqual({
      pathname: '/python-jobs-in-bangalore-and-pune',
      changed: true,
    });
  });
  it('leaves unrelated paths alone', () => {
    expect(sortMultiCitySegment('/job/sales-executive-acme-12345')).toEqual({
      pathname: '/job/sales-executive-acme-12345',
      changed: false,
    });
  });
});

describe('normalizeQuery', () => {
  it('strips tracking params', () => {
    const out = normalizeQuery(new URLSearchParams('q=engineer&utm_source=twitter&utm_medium=social'));
    expect(out.changed).toBe(true);
    expect(out.searchParams.toString()).toBe('q=engineer');
  });
  it('sorts remaining params alphabetically', () => {
    const out = normalizeQuery(new URLSearchParams('sort=recent&q=engineer&page=2'));
    expect(out.changed).toBe(true);
    expect(out.searchParams.toString()).toBe('page=2&q=engineer&sort=recent');
  });
  it('reports no change on already-sorted, no-tracking query', () => {
    const out = normalizeQuery(new URLSearchParams('a=1&b=2&c=3'));
    expect(out.changed).toBe(false);
  });
  it('returns empty when only tracking params are present', () => {
    const out = normalizeQuery(new URLSearchParams('utm_source=email&utm_medium=campaign'));
    expect(out.changed).toBe(true);
    expect(out.searchParams.toString()).toBe('');
  });
});
