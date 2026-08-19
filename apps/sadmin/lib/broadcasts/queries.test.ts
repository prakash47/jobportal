import { describe, expect, it } from 'vitest';
import { broadcastListQuery, pageSizeOf } from './queries';
import { BROADCAST_PAGE_SIZE } from './format';

describe('broadcastListQuery', () => {
  it('sends NO status param for the ALL tab', () => {
    // The API's ListBroadcastsQueryDto is .strict() with no ALL member, so
    // `?status=ALL` is a 400 — an error state on the default tab.
    expect(broadcastListQuery('ALL', 1)).toBe('');
  });

  it('omits page 1 so the default view issues the same request as a bare load', () => {
    expect(broadcastListQuery('SENT', 1)).toBe('?status=SENT');
    expect(broadcastListQuery('SENT', 2)).toBe('?status=SENT&page=2');
  });

  it('encodes a search term that would otherwise truncate the query', () => {
    // Unencoded, "R&D" ends the q param at the ampersand and silently searches
    // for "R" — a wrong result set that looks like a correct one.
    expect(broadcastListQuery('ALL', 1, 'R&D')).toBe('?q=R%26D');
    expect(broadcastListQuery('ALL', 1, 'a b')).toBe('?q=a+b');
  });

  it('composes status and search rather than letting one clobber the other', () => {
    expect(broadcastListQuery('FAILED', 3, 'maintenance')).toBe(
      '?status=FAILED&q=maintenance&page=3',
    );
  });
});

describe('pageSizeOf', () => {
  it('prefers the API response so the two constants cannot drift', () => {
    expect(pageSizeOf({ pageSize: 50 })).toBe(50);
  });

  it('falls back to the local constant for a missing or nonsensical value', () => {
    expect(pageSizeOf({})).toBe(BROADCAST_PAGE_SIZE);
    expect(pageSizeOf({ pageSize: 0 })).toBe(BROADCAST_PAGE_SIZE);
    expect(pageSizeOf({ pageSize: -1 })).toBe(BROADCAST_PAGE_SIZE);
  });
});
