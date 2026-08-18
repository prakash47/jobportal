import { describe, expect, it } from 'vitest';
import { ExportTransactionsDto } from './dto';

const VALID = { from: '2026-08-01', to: '2026-08-31' };

describe('ExportTransactionsDto', () => {
  it('accepts a bare range', () => {
    const parsed = ExportTransactionsDto.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it('accepts an optional tab and query', () => {
    const parsed = ExportTransactionsDto.safeParse({ ...VALID, tab: 'PAID', q: 'acme' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.tab).toBe('PAID');
  });

  it('REQUIRES both ends of the range', () => {
    // A period-less accounting file cannot be reconciled against anything, and
    // requiring both is what lets the filename always name the window.
    expect(ExportTransactionsDto.safeParse({ from: '2026-08-01' }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({ to: '2026-08-31' }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({}).success).toBe(false);
  });

  it('rejects a day that does not exist', () => {
    // Validated through the same parseIstDay the console uses, so the API and
    // the screen cannot disagree about what a valid day is.
    expect(ExportTransactionsDto.safeParse({ ...VALID, from: '2026-02-31' }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({ ...VALID, from: '2026-13-01' }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({ ...VALID, from: '01-08-2026' }).success).toBe(false);
  });

  it('rejects a backwards range', () => {
    const parsed = ExportTransactionsDto.safeParse({ from: '2026-08-31', to: '2026-08-01' });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(/must not be before/);
  });

  it('accepts a single-day range', () => {
    expect(ExportTransactionsDto.safeParse({ from: '2026-08-18', to: '2026-08-18' }).success).toBe(
      true,
    );
  });

  it('accepts a full financial year', () => {
    expect(ExportTransactionsDto.safeParse({ from: '2026-04-01', to: '2027-03-31' }).success).toBe(
      true,
    );
  });

  it('REJECTS an over-long span rather than clamping it', () => {
    // A silently narrowed export hands over a file that looks complete and is
    // not, and the recipient has no way to detect it. 2026-04-01..2027-04-02 is
    // 367 days.
    const parsed = ExportTransactionsDto.safeParse({ from: '2026-04-01', to: '2027-04-02' });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(
      /maximum for one export is 366/,
    );
  });

  it('rejects an unknown tab rather than silently defaulting', () => {
    // The console's URL parser degrades an unknown ?status to ALL, because a
    // bookmarked URL must still render. An API caller asking to export a tab
    // that does not exist is a bug in the caller, and a silent widening to ALL
    // would hand back far more data than was requested.
    expect(ExportTransactionsDto.safeParse({ ...VALID, tab: 'CREATED' }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({ ...VALID, tab: '__proto__' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    // .strict() — a client reusing one form object for several actions must not
    // smuggle an unvalidated field through.
    expect(ExportTransactionsDto.safeParse({ ...VALID, limit: 999999 }).success).toBe(false);
  });

  it('caps the query length', () => {
    expect(ExportTransactionsDto.safeParse({ ...VALID, q: 'a'.repeat(101) }).success).toBe(false);
    expect(ExportTransactionsDto.safeParse({ ...VALID, q: 'a'.repeat(100) }).success).toBe(true);
  });
});
