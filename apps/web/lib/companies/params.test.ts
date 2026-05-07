import { describe, expect, it } from 'vitest';
import { parseDirectoryParams } from './params';

describe('parseDirectoryParams', () => {
  it('returns defaults on an empty query', () => {
    expect(parseDirectoryParams({})).toEqual({ category: null, page: 1 });
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
