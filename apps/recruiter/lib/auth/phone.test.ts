import { describe, expect, it } from 'vitest';
import {
  INDIAN_MOBILE_DIGITS,
  INDIA_CALLING_CODE,
  formatIndianMobile,
  isIndianMobile,
  normalizeIndianMobile,
  toE164IndianMobile,
} from './phone';

describe('normalizeIndianMobile', () => {
  it('leaves a bare national number alone', () => {
    expect(normalizeIndianMobile('9876543210')).toBe('9876543210');
  });

  it('strips every shape of the country code a recruiter might paste', () => {
    expect(normalizeIndianMobile('+919876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('(+91) 98765-43210')).toBe('9876543210');
    expect(normalizeIndianMobile('0091-9876543210')).toBe('9876543210');
  });

  it('strips the domestic trunk prefix', () => {
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('098765 43210')).toBe('9876543210');
  });

  // A 10-digit number that happens to begin "91" is a real subscriber number,
  // not a country code. Length is what disambiguates the two.
  it('does not mistake a leading 91 inside a complete number for the country code', () => {
    expect(normalizeIndianMobile('9198765432')).toBe('9198765432');
  });

  it('keeps a partially typed value intact so the caret never jumps', () => {
    expect(normalizeIndianMobile('9')).toBe('9');
    expect(normalizeIndianMobile('98765')).toBe('98765');
    expect(normalizeIndianMobile('')).toBe('');
  });

  it('drops non-digits and anything past the tenth digit', () => {
    expect(normalizeIndianMobile('98765abc43210')).toBe('9876543210');
    expect(normalizeIndianMobile('98765432109999')).toBe('9876543210');
  });

  // The form feeds its own output back in on every keystroke, so a second pass
  // must not change the value again.
  it('is idempotent', () => {
    for (const raw of ['+91 98765 43210', '09876543210', '9876543210', '98765', 'nonsense']) {
      const once = normalizeIndianMobile(raw);
      expect(normalizeIndianMobile(once)).toBe(once);
    }
  });
});

describe('isIndianMobile', () => {
  it('accepts the 6-9 leading digits TRAI allocates to mobiles', () => {
    expect(isIndianMobile('6123456789')).toBe(true);
    expect(isIndianMobile('7123456789')).toBe(true);
    expect(isIndianMobile('8123456789')).toBe(true);
    expect(isIndianMobile('9876543210')).toBe(true);
  });

  it('accepts a formatted number, because it normalises first', () => {
    expect(isIndianMobile('+91 98765 43210')).toBe(true);
  });

  it('rejects landline and service ranges', () => {
    expect(isIndianMobile('1234567890')).toBe(false);
    expect(isIndianMobile('5123456789')).toBe(false);
  });

  it('rejects anything that is not exactly ten digits', () => {
    expect(isIndianMobile('')).toBe(false);
    expect(isIndianMobile('987654321')).toBe(false);
    expect(isIndianMobile('98765')).toBe(false);
  });
});

describe('toE164IndianMobile', () => {
  it('prefixes the calling code with no separators', () => {
    expect(toE164IndianMobile('9876543210')).toBe('+919876543210');
    expect(toE164IndianMobile('9876543210')).toHaveLength(INDIA_CALLING_CODE.length + INDIAN_MOBILE_DIGITS);
  });

  // The property the whole module exists for: however the recruiter typed it,
  // the OTP request and the register call must put the identical bytes on the
  // wire, or the API's exact destination comparison rejects the registration.
  it('produces one identical string for every way of typing the same number', () => {
    const forms = ['9876543210', '+91 98765 43210', '(+91) 98765-43210', '09876543210', '0091 9876543210'];
    const results = new Set(forms.map(toE164IndianMobile));
    expect(results).toEqual(new Set(['+919876543210']));
  });

  it('satisfies the API phone regex shared with the profile DTO', () => {
    expect(/^[+0-9 \-()]{6,20}$/.test(toE164IndianMobile('+91 98765 43210'))).toBe(true);
  });
});

describe('formatIndianMobile', () => {
  it('groups a complete number for display', () => {
    expect(formatIndianMobile('9876543210')).toBe('+91 98765 43210');
    expect(formatIndianMobile('+919876543210')).toBe('+91 98765 43210');
  });

  it('shows only the digits actually typed when the number is incomplete', () => {
    expect(formatIndianMobile('98765')).toBe('+91 98765');
    expect(formatIndianMobile('')).toBe('+91');
  });
});
