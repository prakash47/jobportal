import { COUNTRIES, DEFAULT_COUNTRY_ISO } from './countries';

/**
 * Splitting and rejoining the single `phone` column around a country selector.
 *
 * There is no schema change behind this. Every seeded user who has a phone
 * already stores `"+91 98765 43002"` — dial code, space, national number — so
 * these helpers make the UI produce the shape the data already assumes. The
 * result stays inside the API's existing `z.string().min(7).max(20)`.
 */

/** Longest first, so +1876 (Jamaica) is not matched as +1 (United States). */
const BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b[2].length - a[2].length);

export interface SplitPhone {
  iso: string;
  national: string;
}

/**
 * Parse a stored value into a country and a national number.
 *
 * Falls back to the default country rather than throwing or returning null:
 * this runs on profile load against rows written before the selector existed,
 * and a value it cannot parse must still leave the user an editable field.
 */
export function splitPhone(stored: string | null | undefined): SplitPhone {
  const raw = (stored ?? '').trim();
  if (!raw) return { iso: DEFAULT_COUNTRY_ISO, national: '' };

  if (raw.startsWith('+')) {
    const digits = raw.replace(/[^\d]/g, '');
    for (const [iso, , dial] of BY_DIAL_LENGTH) {
      const code = dial.slice(1);
      if (digits.startsWith(code)) {
        return { iso, national: digits.slice(code.length) };
      }
    }
    // A leading + we cannot attribute: keep the digits so nothing is lost.
    return { iso: DEFAULT_COUNTRY_ISO, national: digits };
  }

  // No dial code at all — a row written before this control existed.
  return { iso: DEFAULT_COUNTRY_ISO, national: raw.replace(/[^\d]/g, '') };
}

/**
 * Build the stored value, or null when there is no number.
 *
 * Null rather than a bare `"+91"`: the field is optional, and storing a dial
 * code with no number would be a phone number that cannot be called, would
 * fail the API's `min(7)`, and would make an empty field look filled the next
 * time the profile loads.
 */
export function joinPhone(iso: string, national: string): string | null {
  const digits = national.replace(/[^\d]/g, '');
  if (!digits) return null;
  const match = COUNTRIES.find((c) => c[0] === iso.toUpperCase());
  const dial = match ? match[2] : '+91';
  return `${dial} ${digits}`;
}
