import { describe, expect, it } from 'vitest';
import { pageSizeOf, ticketListQuery } from './queries';
import { SUPPORT_PAGE_SIZE } from './format';

describe('ticketListQuery', () => {
  it('is empty for the default view', () => {
    expect(ticketListQuery('OPEN', 1)).toBe('?status=OPEN');
  });

  // The load-bearing one. 'ALL' is a UI tab with no API counterpart: the DTO is
  // .strict() and its enum has no ALL member, so forwarding it is a 400 and the
  // page renders its error state on the one tab that should never fail.
  it('sends NO status param for the ALL tab', () => {
    expect(ticketListQuery('ALL', 1)).toBe('');
    expect(ticketListQuery('ALL', 2)).toBe('?page=2');
  });

  it('sends a real status for every other tab', () => {
    expect(ticketListQuery('IN_PROGRESS', 1)).toBe('?status=IN_PROGRESS');
    expect(ticketListQuery('CLOSED', 1)).toBe('?status=CLOSED');
  });

  it('omits page 1 so the default view is one request shape', () => {
    expect(ticketListQuery('ALL', 1)).not.toContain('page');
    expect(ticketListQuery('ALL', 3)).toContain('page=3');
  });

  // A search for "R&D" would truncate at the ampersand and silently search for
  // "R" — wrong results with no error anywhere.
  it('encodes a query containing URL metacharacters', () => {
    expect(ticketListQuery('ALL', 1, 'R&D')).toBe('?q=R%26D');
    expect(ticketListQuery('ALL', 1, 'a#b')).toBe('?q=a%23b');
    expect(ticketListQuery('ALL', 1, 'a=b')).toBe('?q=a%3Db');
  });

  // A LIKE wildcard must reach the API intact — the API is what escapes it. If
  // the console stripped or escaped it here too it would be double-escaped and
  // a literal search for "100%" would stop matching.
  it('passes % through to the API, which is what escapes it', () => {
    expect(ticketListQuery('ALL', 1, '100%')).toBe('?q=100%25');
  });

  it('composes status, q and page in a fixed order', () => {
    expect(ticketListQuery('RESOLVED', 2, 'acme')).toBe('?status=RESOLVED&q=acme&page=2');
  });

  it('omits an empty query rather than sending q=', () => {
    expect(ticketListQuery('ALL', 1, '')).toBe('');
    expect(ticketListQuery('ALL', 1, undefined)).toBe('');
  });
});

describe('pageSizeOf', () => {
  // Prefer the API's own number — the console constant and the service constant
  // live in different packages and drift is exactly how an over-range redirect
  // starts computing the wrong last page.
  it('prefers the API-reported page size', () => {
    expect(pageSizeOf({ pageSize: 50 })).toBe(50);
  });

  it('falls back to the local constant for a missing or nonsense value', () => {
    expect(pageSizeOf({})).toBe(SUPPORT_PAGE_SIZE);
    expect(pageSizeOf({ pageSize: 0 })).toBe(SUPPORT_PAGE_SIZE);
    expect(pageSizeOf({ pageSize: -1 })).toBe(SUPPORT_PAGE_SIZE);
  });
});
