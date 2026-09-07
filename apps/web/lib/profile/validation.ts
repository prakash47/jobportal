/**
 * Field rules for the personal-details form.
 *
 * Kept out of the component so they can be tested: the suite only collects
 * `lib/**`, and these are exactly the parts where an off-by-one is invisible in
 * a screenshot but wrong in the database.
 */

/** India's national numbers are exactly 10 digits, and are the default here. */
export const INDIA_ISO = 'IN';
export const INDIA_PHONE_DIGITS = 10;

/**
 * E.164 caps a full international number at 15 digits *including* the country
 * code, so a national number can never legitimately exceed 14. Used as the
 * ceiling for every country we have no specific rule for — a loose bound that
 * blocks nonsense without rejecting a valid foreign number.
 */
export const MAX_PHONE_DIGITS = 14;

export function phoneDigitLimit(iso: string): number {
  return iso.toUpperCase() === INDIA_ISO ? INDIA_PHONE_DIGITS : MAX_PHONE_DIGITS;
}

/**
 * Strip everything that is not a digit and clamp to the country's limit.
 *
 * Applied on every keystroke, so pasting "+91 (98765) 43210" yields
 * "9876543210" rather than being rejected — the user is told nothing because
 * nothing went wrong.
 */
export function sanitizePhoneInput(raw: string, iso: string): string {
  return raw.replace(/\D/g, '').slice(0, phoneDigitLimit(iso));
}

export type PhoneStatus = 'empty' | 'incomplete' | 'valid';

/**
 * Phone is optional, so an empty field is not an error — it is simply empty.
 * Only a partially-typed number is worth flagging, and only for a country
 * whose exact length we actually know.
 */
export function phoneStatus(digits: string, iso: string): PhoneStatus {
  if (digits === '') return 'empty';
  if (iso.toUpperCase() === INDIA_ISO) {
    return digits.length === INDIA_PHONE_DIGITS ? 'valid' : 'incomplete';
  }
  // Minimum plausible national number worldwide; the API's own floor is 7
  // characters on the joined string.
  return digits.length >= 6 ? 'valid' : 'incomplete';
}

/** Matches the API's `summary: z.string().max(5_000)`. */
export const SUMMARY_MAX = 5_000;
/** Matches the API's `headline: z.string().max(250)`. */
export const HEADLINE_MAX = 250;

export type CounterTone = 'normal' | 'warning' | 'over';

/**
 * State for a character counter.
 *
 * `over` cannot normally be reached because the textarea carries a maxLength,
 * but a value restored from a row written before the limit tightened can
 * exceed it — and silently truncating someone's saved summary would be worse
 * than showing them it is too long.
 */
export function counterState(
  value: string,
  max: number,
): { used: number; max: number; remaining: number; tone: CounterTone } {
  const used = value.length;
  const remaining = max - used;
  const tone: CounterTone = remaining < 0 ? 'over' : remaining <= max * 0.1 ? 'warning' : 'normal';
  return { used, max, remaining, tone };
}

/**
 * Latest date someone may be born on and still be old enough to work, as
 * `YYYY-MM-DD` for a date input's `max`. Mirrors the API's MIN_AGE_YEARS.
 */
export function maxBirthDate(today: Date = new Date()): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - 14, today.getUTCMonth(), today.getUTCDate()),
  );
  return d.toISOString().slice(0, 10);
}

/** Earliest plausible birth date, for the input's `min`. */
export function minBirthDate(today: Date = new Date()): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - 100, today.getUTCMonth(), today.getUTCDate()),
  );
  return d.toISOString().slice(0, 10);
}

/** Render a stored ISO timestamp as the `YYYY-MM-DD` a date input expects. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
