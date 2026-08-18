import { describe, expect, it } from 'vitest';
import { reportWhere } from './queries';

// The where-builder is pure and exported precisely so it can be tested without
// a database — the same approach lib/subscriptions/queries.test.ts takes. It is
// handed BY REFERENCE to both count() and findMany(), so anything wrong here is
// wrong in the total, the summary sentence, the pagination links AND the
// over-range redirect simultaneously.
describe('reportWhere', () => {
  it('filters on the tab status', () => {
    expect(reportWhere('OPEN')).toEqual({ status: 'OPEN' });
    expect(reportWhere('DISMISSED')).toEqual({ status: 'DISMISSED' });
  });

  it('omits the status key entirely on ALL', () => {
    // 'ALL' is a pseudo-status meaning "no predicate". Setting `status:
    // undefined` would be a different thing under exactOptionalPropertyTypes and
    // reads as though a filter were intended.
    expect(reportWhere('ALL')).toEqual({});
    expect(reportWhere('ALL')).not.toHaveProperty('status');
  });

  it('searches the posting title and the company name', () => {
    // A report has no words of its own worth searching: `details` is optional
    // free text most reporters leave blank, and the reason is a tab-level facet.
    // "Everything reported against Acme" is the question staff actually ask.
    const where = reportWhere('ALL', 'acme');
    const or = where.job && typeof where.job === 'object' && 'is' in where.job
      ? (where.job.is as { OR?: unknown[] }).OR
      : undefined;
    expect(or).toHaveLength(2);
    expect(JSON.stringify(or)).toContain('title');
    expect(JSON.stringify(or)).toContain('company');
  });

  it('keeps the status filter alongside a search', () => {
    const where = reportWhere('OPEN', 'acme');
    expect(where.status).toBe('OPEN');
    expect(where.job).toBeDefined();
  });

  it('omits the job clause entirely when there is no search', () => {
    expect(reportWhere('OPEN')).not.toHaveProperty('job');
  });

  // ⚠ Prisma's `contains` compiles to an unescaped LIKE. Without escaping,
  // `?q=%` matches EVERY report and `?q=a_c` matches "abc" — neither is what a
  // search box means.
  it('escapes LIKE wildcards in the search term', () => {
    const serialised = JSON.stringify(reportWhere('ALL', '100%_off'));
    expect(serialised).toContain('100\\\\%\\\\_off');
    expect(serialised).not.toContain('100%_off');
  });

  it('escapes a backslash before the wildcards it introduces', () => {
    // Backslash first, or the escapes this adds get double-escaped.
    const serialised = JSON.stringify(reportWhere('ALL', 'a\\b'));
    expect(serialised).toContain('a\\\\\\\\b');
  });

  it('matches case-insensitively', () => {
    expect(JSON.stringify(reportWhere('ALL', 'acme'))).toContain('insensitive');
  });
});
