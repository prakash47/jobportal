import { describe, expect, it } from 'vitest';
import { joinPhone, splitPhone } from './format';

// The stored shape is not being invented here: every one of the 9 users in the
// seeded database that has a phone already stores "+91 98765 43002" — dial
// code, space, national number. These helpers make the UI produce the shape the
// data already assumes, which is why no migration or backfill is involved.

describe('splitPhone', () => {
  it('splits the shape the database already stores', () => {
    expect(splitPhone('+91 98765 43002')).toEqual({ iso: 'IN', national: '9876543002' });
  });

  it('defaults to India when there is nothing stored', () => {
    expect(splitPhone(null)).toEqual({ iso: 'IN', national: '' });
    expect(splitPhone('')).toEqual({ iso: 'IN', national: '' });
  });

  // Pre-existing rows are not guaranteed to carry a dial code. Treating a bare
  // number as Indian keeps those editable rather than mangling them.
  it('treats a bare number as the default country', () => {
    expect(splitPhone('9876543210')).toEqual({ iso: 'IN', national: '9876543210' });
  });

  it('handles a longer dial code', () => {
    expect(splitPhone('+971 50 123 4567')).toEqual({ iso: 'AE', national: '501234567' });
  });

  // +1876 (Jamaica) starts with +1 (United States). A shortest-first match
  // would strip only "+1" and leave 876 glued to the national number.
  it('prefers the LONGEST matching dial code', () => {
    expect(splitPhone('+18765550123').iso).toBe('JM');
    expect(splitPhone('+18765550123').national).toBe('5550123');
  });

  it('falls back to the default rather than throwing on nonsense', () => {
    expect(splitPhone('+9999999 12345').iso).toBe('IN');
  });
});

describe('joinPhone', () => {
  it('produces the stored shape', () => {
    expect(joinPhone('IN', '98765 43210')).toBe('+91 9876543210');
  });

  it('returns null when there is no number, so `phone` is omitted entirely', () => {
    expect(joinPhone('IN', '')).toBeNull();
    expect(joinPhone('IN', '   ')).toBeNull();
    // A dial code on its own is not a phone number and must never be stored.
    expect(joinPhone('IN', 'abc')).toBeNull();
  });

  it('stays inside the API max of 20 characters for a long code', () => {
    const v = joinPhone('JM', '5550123456');
    expect(v).not.toBeNull();
    expect((v as string).length).toBeLessThanOrEqual(20);
  });

  it('round-trips', () => {
    const stored = joinPhone('AE', '501234567');
    expect(stored).toBe('+971 501234567');
    expect(splitPhone(stored)).toEqual({ iso: 'AE', national: '501234567' });
  });
});
