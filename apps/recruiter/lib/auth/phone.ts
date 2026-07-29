// Indian mobile-number handling for recruiter signup (SRS §4.9.1).
//
// Pure and framework-free, which is why it lives under lib/ — vitest.config.ts
// only collects `lib/**/*.test.ts`, and this logic genuinely needs the coverage:
// the SAME string has to come out of two separate requests that the API
// compares byte-for-byte. The OTP request stores it as OtpChallenge.destination;
// the register call sends it as `phone`, and registration is rejected unless the
// two are exactly equal. A dropped country code or a stray space there surfaces
// to the recruiter as "verify your mobile number" on a number they just
// verified, so all normalisation happens here, once, and is tested.

/** India's country calling code. Signup accepts Indian mobiles only. */
export const INDIA_CALLING_CODE = '+91';

/** Digits in the national (subscriber) part of an Indian mobile number. */
export const INDIAN_MOBILE_DIGITS = 10;

/**
 * Cap for the mobile field's `maxlength` — a bound on the RAW characters a
 * recruiter may type or paste, not on the number inside them. It mirrors the
 * upper bound of the phone regex the API shares with the profile DTO,
 * `/^[+0-9 \-()]{6,20}$/`.
 *
 * Deliberately NOT `INDIAN_MOBILE_DIGITS`: the browser applies `maxlength`
 * before any `input` event fires, so a cap of 10 clips `+91 98765 43210` to
 * `+91 98765 ` and `normalizeIndianMobile` never sees the country code it
 * exists to strip.
 */
export const INDIAN_MOBILE_INPUT_MAX_LENGTH = 20;

// TRAI's national numbering plan: mobiles are 10 digits and start with 6-9.
// Landlines and the 1xxx service ranges are rejected because signup codes are
// relayed by hand: a Career Queue team member reads the code out over a call or
// sends it on WhatsApp, and the WhatsApp half only works on a mobile. Nothing is
// auto-dialled or texted, so this is a product rule about how we can reach a
// registrant, not a delivery constraint.
//
// The API is deliberately looser — it only checks the shape above — so this
// narrowing exists here and nowhere else. Relaxing it is a product decision, not
// a matter of matching the server.
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Reduce anything a recruiter might type or paste to the bare 10-digit national
 * number: `+91 98765 43210`, `098765 43210`, `0091-9876543210` and
 * `9876543210` all collapse to `9876543210`.
 *
 * Digits past the tenth are KEPT rather than trimmed. The mobile field is
 * controlled and feeds this function's own output back in on the next
 * keystroke, so trimming makes every longer form unreachable by typing:
 * `+919876543210` would stall at `9198765432` — ten digits that satisfy
 * `isIndianMobile` and belong to somebody else. An over-long value is not a
 * number we can guess at either; leaving it over-long is precisely what makes
 * `isIndianMobile` reject it instead of silently accepting a prefix.
 *
 * Deliberately does NOT re-group the digits for display (`98765 43210`). The
 * form runs this on every keystroke, and re-inserting separators mid-string
 * pushes the caret to the end, which makes correcting the fourth digit of your
 * own number impossible. Grouping is display-only — see `formatIndianMobile`.
 */
export function normalizeIndianMobile(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  // A leading 0 is India's domestic trunk prefix and 00 is the IDD prefix; both
  // are dialling instructions rather than part of the number. Stripped only
  // while the value is still longer than a national number, so a half-typed
  // value is never rewritten under the recruiter's caret.
  if (digits.length > INDIAN_MOBILE_DIGITS) digits = digits.replace(/^0+/, '');
  if (digits.length === INDIAN_MOBILE_DIGITS + 2 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

/** True when `value` normalises to a complete, plausible Indian mobile number. */
export function isIndianMobile(value: string): boolean {
  return INDIAN_MOBILE_RE.test(normalizeIndianMobile(value));
}

/**
 * E.164 form, e.g. `+919876543210`. This exact string goes on the wire as BOTH
 * the OTP request's `destination` and the register call's `phone`, and it
 * satisfies the API's shared phone regex `/^[+0-9 \-()]{6,20}$/`.
 *
 * It normalises first rather than trusting its caller, so there is no way for
 * the two requests to disagree even if one of them is handed a raw value.
 */
export function toE164IndianMobile(value: string): string {
  return `${INDIA_CALLING_CODE}${normalizeIndianMobile(value)}`;
}

/**
 * Readable form for confirmation copy: `+91 98765 43210`. Display only — the
 * spaces would break the API's exact `destination` comparison, so never send
 * this. A value that is not exactly ten digits is rendered as far as it goes
 * rather than padded, so the "code created for…" line can never show digits
 * nobody typed.
 */
export function formatIndianMobile(value: string): string {
  const digits = normalizeIndianMobile(value);
  if (digits.length !== INDIAN_MOBILE_DIGITS) return `${INDIA_CALLING_CODE} ${digits}`.trimEnd();
  return `${INDIA_CALLING_CODE} ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
