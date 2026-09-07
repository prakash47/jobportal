import { describe, expect, it } from 'vitest';
import {
  counterState,
  INDIA_PHONE_DIGITS,
  MAX_PHONE_DIGITS,
  maxBirthDate,
  minBirthDate,
  phoneDigitLimit,
  phoneStatus,
  sanitizePhoneInput,
  SUMMARY_MAX,
  toDateInputValue,
} from './validation';

describe('sanitizePhoneInput', () => {
  it('strips every non-digit character', () => {
    expect(sanitizePhoneInput('98765-43210', 'IN')).toBe('9876543210');
    expect(sanitizePhoneInput('(987) 654 3210', 'IN')).toBe('9876543210');
    expect(sanitizePhoneInput('abc987def6543210xyz', 'IN')).toBe('9876543210');
  });

  it('rejects letters entirely rather than passing them through', () => {
    expect(sanitizePhoneInput('abcdef', 'IN')).toBe('');
  });

  it('caps India at 10 digits', () => {
    expect(sanitizePhoneInput('98765432101234', 'IN')).toBe('9876543210');
    expect(sanitizePhoneInput('98765432101234', 'IN')).toHaveLength(INDIA_PHONE_DIGITS);
  });

  it('allows longer national numbers outside India', () => {
    // A 10-digit cap would truncate legitimate foreign numbers, which is why
    // the limit is per-country rather than a single constant.
    expect(sanitizePhoneInput('12345678901234', 'GB')).toHaveLength(MAX_PHONE_DIGITS);
    expect(sanitizePhoneInput('7911123456', 'GB')).toBe('7911123456');
  });

  it('treats the iso case-insensitively', () => {
    expect(phoneDigitLimit('in')).toBe(INDIA_PHONE_DIGITS);
    expect(phoneDigitLimit('IN')).toBe(INDIA_PHONE_DIGITS);
  });

  it('keeps a leading zero, which Number() would have eaten', () => {
    expect(sanitizePhoneInput('0987654321', 'IN')).toBe('0987654321');
  });
});

describe('phoneStatus', () => {
  it('reports an empty field as empty, not invalid — the field is optional', () => {
    expect(phoneStatus('', 'IN')).toBe('empty');
    expect(phoneStatus('', 'GB')).toBe('empty');
  });

  it('flags a partial Indian number and accepts a complete one', () => {
    expect(phoneStatus('98765', 'IN')).toBe('incomplete');
    expect(phoneStatus('987654321', 'IN')).toBe('incomplete');
    expect(phoneStatus('9876543210', 'IN')).toBe('valid');
  });

  it('uses a loose floor elsewhere', () => {
    expect(phoneStatus('12345', 'GB')).toBe('incomplete');
    expect(phoneStatus('123456', 'GB')).toBe('valid');
  });
});

describe('counterState', () => {
  it('counts used and remaining', () => {
    const s = counterState('hello', 500);
    expect(s.used).toBe(5);
    expect(s.remaining).toBe(495);
    expect(s.tone).toBe('normal');
  });

  it('warns inside the last 10 per cent', () => {
    expect(counterState('x'.repeat(449), 500).tone).toBe('normal');
    expect(counterState('x'.repeat(450), 500).tone).toBe('warning');
    expect(counterState('x'.repeat(500), 500).tone).toBe('warning');
  });

  it('reports over-length for a value restored from an older, looser row', () => {
    const s = counterState('x'.repeat(SUMMARY_MAX + 20), SUMMARY_MAX);
    expect(s.tone).toBe('over');
    expect(s.remaining).toBe(-20);
  });

  it('handles an empty value', () => {
    expect(counterState('', 500)).toMatchObject({ used: 0, remaining: 500, tone: 'normal' });
  });
});

describe('birth date bounds', () => {
  const TODAY = new Date('2026-09-07T12:00:00.000Z');

  it('puts the youngest allowed birthday exactly 14 years back', () => {
    expect(maxBirthDate(TODAY)).toBe('2012-09-07');
  });

  it('puts the oldest allowed birthday exactly 100 years back', () => {
    expect(minBirthDate(TODAY)).toBe('1926-09-07');
  });

  it('orders min before max', () => {
    expect(minBirthDate(TODAY) < maxBirthDate(TODAY)).toBe(true);
  });
});

describe('toDateInputValue', () => {
  it('renders a stored timestamp as the date input format', () => {
    expect(toDateInputValue('1998-05-12T00:00:00.000Z')).toBe('1998-05-12');
  });

  it('is empty for null or an unparseable value', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('not a date')).toBe('');
  });

  it('does not shift the day for a UTC-midnight value', () => {
    // The API pins dateOfBirth to UTC midnight precisely so this round-trip is
    // stable; reading it back with local-time getters would move it a day in
    // any timezone west of UTC.
    expect(toDateInputValue('2000-01-01T00:00:00.000Z')).toBe('2000-01-01');
  });
});
