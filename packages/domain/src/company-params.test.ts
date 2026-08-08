import { describe, expect, it } from 'vitest';
import { buildDirectoryQuery, parseDirectoryParams } from './company-params';

describe('parseDirectoryParams', () => {
  it('returns defaults on an empty query', () => {
    expect(parseDirectoryParams({})).toEqual({
      category: null,
      sort: 'rating',
      hiring: false,
      page: 1,
    });
  });

  it('reads ?category as a single slug', () => {
    expect(parseDirectoryParams({ category: 'information-technology' })).toMatchObject({
      category: 'information-technology',
    });
  });

  it('rejects non-slug ?category values', () => {
    expect(parseDirectoryParams({ category: 'Information Tech!' })).toMatchObject({
      category: null,
    });
    expect(parseDirectoryParams({ category: 'UPPER' })).toMatchObject({ category: null });
  });

  it('treats array ?category as the first value', () => {
    expect(parseDirectoryParams({ category: ['fintech', 'edtech'] })).toMatchObject({
      category: 'fintech',
    });
  });

  it('reads ?sort from the whitelist, else defaults to rating', () => {
    expect(parseDirectoryParams({ sort: 'reviews' })).toMatchObject({ sort: 'reviews' });
    expect(parseDirectoryParams({ sort: 'name' })).toMatchObject({ sort: 'name' });
    expect(parseDirectoryParams({ sort: 'bogus' })).toMatchObject({ sort: 'rating' });
    expect(parseDirectoryParams({})).toMatchObject({ sort: 'rating' });
  });

  it('reads ?hiring as a boolean flag', () => {
    expect(parseDirectoryParams({ hiring: '1' })).toMatchObject({ hiring: true });
    expect(parseDirectoryParams({ hiring: 'true' })).toMatchObject({ hiring: true });
    expect(parseDirectoryParams({ hiring: '0' })).toMatchObject({ hiring: false });
    expect(parseDirectoryParams({})).toMatchObject({ hiring: false });
  });

  it('?page defaults to 1', () => {
    expect(parseDirectoryParams({})).toMatchObject({ page: 1 });
    expect(parseDirectoryParams({ page: '0' })).toMatchObject({ page: 1 });
    expect(parseDirectoryParams({ page: '-3' })).toMatchObject({ page: 1 });
    expect(parseDirectoryParams({ page: 'abc' })).toMatchObject({ page: 1 });
  });

  it('?page accepts positive integers', () => {
    expect(parseDirectoryParams({ page: '5' })).toMatchObject({ page: 5 });
    expect(parseDirectoryParams({ page: '12' })).toMatchObject({ page: 12 });
  });

  it('?page floors floats', () => {
    expect(parseDirectoryParams({ page: '3.7' })).toMatchObject({ page: 3 });
  });
});

describe('buildDirectoryQuery', () => {
  it('drops defaults', () => {
    expect(buildDirectoryQuery({})).toBe('');
    expect(buildDirectoryQuery({ sort: 'rating', hiring: false, page: 1 })).toBe('');
  });

  it('serializes non-default values', () => {
    expect(buildDirectoryQuery({ category: 'fintech' })).toBe('category=fintech');
    expect(buildDirectoryQuery({ sort: 'reviews' })).toBe('sort=reviews');
    expect(buildDirectoryQuery({ hiring: true })).toBe('hiring=1');
    expect(buildDirectoryQuery({ page: 3 })).toBe('page=3');
  });

  it('combines params in a stable order', () => {
    expect(
      buildDirectoryQuery({ category: 'fintech', sort: 'name', hiring: true, page: 2 }),
    ).toBe('category=fintech&sort=name&hiring=1&page=2');
  });
});
