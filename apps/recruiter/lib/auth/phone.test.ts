import { describe, expect, it } from 'vitest';
import {
  INDIAN_MOBILE_DIGITS,
  INDIAN_MOBILE_INPUT_MAX_LENGTH,
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

  it('drops non-digits', () => {
    expect(normalizeIndianMobile('98765abc43210')).toBe('9876543210');
  });

  // Trimming to ten would turn an entry nobody can interpret into a plausible
  // number and hand it to the API. It also breaks typing: the field feeds this
  // output back in on the next keystroke, so a trimmed value can never grow into
  // the country-coded form below.
  it('keeps digits past the tenth so an over-long entry stays invalid', () => {
    expect(normalizeIndianMobile('98765432109999')).toBe('98765432109999');
    expect(isIndianMobile('98765432109999')).toBe(false);
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

// The mobile field is a controlled input: the browser applies `maxlength` to the
// raw characters BEFORE any input event fires, then VerifiableField.handleValueChange
// runs `normalizeIndianMobile` over what survived and writes the result straight
// back as the field's value. These two helpers reproduce exactly that loop, which
// is the only place the cap and the normaliser meet — and the place a cap of
// INDIAN_MOBILE_DIGITS broke both paste (clipping "+91 98765 43210" to
// "+91 98765 ") and typing (stalling "+919876543210" at "9198765432", ten digits
// that pass isIndianMobile and belong to somebody else).
//
// Unit tests rather than a rendered component: this workspace has no jsdom or
// React testing stack (vitest.config.ts collects lib/** and runs in node), so the
// binding to the real UI is that VerifiableField reads its maxLength from the
// same INDIAN_MOBILE_INPUT_MAX_LENGTH used here.

/** One paste into an empty field: the browser truncates, then we normalise. */
function pasteIntoMobileField(raw: string): string {
  return normalizeIndianMobile(raw.slice(0, INDIAN_MOBILE_INPUT_MAX_LENGTH));
}

/** The same field, one keystroke at a time, re-reading its own value each time. */
function typeIntoMobileField(raw: string): string {
  let value = '';
  for (const character of raw) {
    value = normalizeIndianMobile(`${value}${character}`.slice(0, INDIAN_MOBILE_INPUT_MAX_LENGTH));
  }
  return value;
}

const ENTRY_FORMS = [
  '9876543210',
  '+919876543210',
  '+91 98765 43210',
  '09876543210',
  '91 9876543210',
] as const;

describe('the mobile field, end to end through its change handler', () => {
  it.each(ENTRY_FORMS)('accepts %s when it is pasted', (raw) => {
    const value = pasteIntoMobileField(raw);
    expect(isIndianMobile(value)).toBe(true);
    expect(toE164IndianMobile(value)).toBe('+919876543210');
  });

  it.each(ENTRY_FORMS)('accepts %s when it is typed one character at a time', (raw) => {
    const value = typeIntoMobileField(raw);
    expect(isIndianMobile(value)).toBe(true);
    expect(toE164IndianMobile(value)).toBe('+919876543210');
  });

  it('never settles on a ten-digit number the recruiter did not type', () => {
    // The dangerous half of the old cap: this passed every client check and put
    // a different subscriber's number on the wire without an error anywhere.
    expect(typeIntoMobileField('+919876543210')).not.toBe('9198765432');
  });

  it('leaves room for every formatted shape the normaliser documents', () => {
    for (const raw of ['+91 98765 43210', '(+91) 98765-43210', '0091-9876543210']) {
      expect(raw.length).toBeLessThanOrEqual(INDIAN_MOBILE_INPUT_MAX_LENGTH);
      expect(pasteIntoMobileField(raw)).toBe('9876543210');
    }
  });

  it('caps raw entry at the API phone regex bound, not at the digit count', () => {
    expect(INDIAN_MOBILE_INPUT_MAX_LENGTH).toBeGreaterThan(INDIAN_MOBILE_DIGITS);
    // A cap the API itself would reject as a `phone` would be pointless.
    expect(/^[+0-9 \-()]{6,20}$/.test('9'.repeat(INDIAN_MOBILE_INPUT_MAX_LENGTH))).toBe(true);
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
