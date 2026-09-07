export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional second line, e.g. a city's state. Searched along with the label. */
  hint?: string;
}

/**
 * Cap on rendered rows. The city catalogue is ~700 entries and the skill
 * catalogue larger still; painting every match on each keystroke is what made
 * the old always-visible chip wall sluggish.
 */
export const MAX_VISIBLE = 50;

/**
 * Filter + rank catalogue options for a combobox.
 *
 * Prefix matches rank above substring matches: typing "n" should offer New
 * Delhi and Noida before Bengaluru, which the raw alphabetical catalogue order
 * would not do. Lives in `lib/` rather than beside the component because the
 * component is `'use client'` and the test suite only collects `lib/**`.
 */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, MAX_VISIBLE);

  const starts: ComboboxOption[] = [];
  const contains: ComboboxOption[] = [];
  for (const o of options) {
    const label = o.label.toLowerCase();
    if (label.startsWith(q)) starts.push(o);
    else if (label.includes(q) || o.hint?.toLowerCase().includes(q)) contains.push(o);
    // Once the prefix bucket alone fills the list nothing later can rank into
    // it, so stop walking the catalogue.
    if (starts.length >= MAX_VISIBLE) break;
  }
  return [...starts, ...contains].slice(0, MAX_VISIBLE);
}
