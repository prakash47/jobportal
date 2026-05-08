import { describe, expect, it } from 'vitest';
import { parseArticleIndexParams } from './params';

describe('parseArticleIndexParams', () => {
  it('returns defaults on an empty query', () => {
    expect(parseArticleIndexParams({})).toEqual({ tag: null, page: 1 });
  });

  it('reads ?tag as a single slug', () => {
    expect(parseArticleIndexParams({ tag: 'resume' })).toMatchObject({ tag: 'resume' });
  });

  it('rejects non-slug ?tag values', () => {
    expect(parseArticleIndexParams({ tag: 'Resume!' })).toMatchObject({ tag: null });
    expect(parseArticleIndexParams({ tag: 'Resume Tips' })).toMatchObject({ tag: null });
    expect(parseArticleIndexParams({ tag: 'UPPER' })).toMatchObject({ tag: null });
  });

  it('treats array ?tag as the first value', () => {
    expect(parseArticleIndexParams({ tag: ['resume', 'salary'] })).toMatchObject({ tag: 'resume' });
  });

  it('?page sanity', () => {
    expect(parseArticleIndexParams({ page: '0' })).toMatchObject({ page: 1 });
    expect(parseArticleIndexParams({ page: '-3' })).toMatchObject({ page: 1 });
    expect(parseArticleIndexParams({ page: 'abc' })).toMatchObject({ page: 1 });
    expect(parseArticleIndexParams({ page: '5' })).toMatchObject({ page: 5 });
    expect(parseArticleIndexParams({ page: '3.7' })).toMatchObject({ page: 3 });
  });
});
