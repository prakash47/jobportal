import type { ComboboxOption } from '../ui/combobox-filter';

/**
 * Nationalities offered in the personal-details dropdown.
 *
 * Stored as free text (`Candidate.nationality`) rather than an enum so the list
 * can grow without a migration, and so a value that predates the list survives.
 * India is pinned first because this is an India-first product; the rest are
 * alphabetical. Coverage is India + its neighbours + the countries Indian
 * candidates most often hold a second passport from — extend it here rather
 * than inventing a parallel list elsewhere.
 */
export const NATIONALITIES: readonly string[] = [
  'Indian',
  'Afghan',
  'American',
  'Australian',
  'Austrian',
  'Bangladeshi',
  'Belgian',
  'Bhutanese',
  'Brazilian',
  'British',
  'Bulgarian',
  'Canadian',
  'Chinese',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'Egyptian',
  'Emirati',
  'Filipino',
  'Finnish',
  'French',
  'German',
  'Ghanaian',
  'Greek',
  'Hungarian',
  'Indonesian',
  'Iranian',
  'Iraqi',
  'Irish',
  'Israeli',
  'Italian',
  'Japanese',
  'Jordanian',
  'Kenyan',
  'Kuwaiti',
  'Malaysian',
  'Maldivian',
  'Mauritian',
  'Mexican',
  'Myanmar',
  'Nepali',
  'New Zealander',
  'Nigerian',
  'Norwegian',
  'Omani',
  'Pakistani',
  'Polish',
  'Portuguese',
  'Qatari',
  'Romanian',
  'Russian',
  'Saudi Arabian',
  'Singaporean',
  'South African',
  'South Korean',
  'Spanish',
  'Sri Lankan',
  'Swedish',
  'Swiss',
  'Taiwanese',
  'Tanzanian',
  'Thai',
  'Turkish',
  'Ugandan',
  'Ukrainian',
  'Vietnamese',
  'Zambian',
  'Zimbabwean',
  'Other',
];

export const NATIONALITY_OPTIONS: ComboboxOption[] = NATIONALITIES.map((n) => ({
  value: n,
  label: n,
}));

/**
 * Languages offered in the languages editor: the 22 scheduled languages of the
 * Eighth Schedule to the Constitution of India, plus English, plus the foreign
 * languages that show up most on Indian résumés. Free text is still accepted by
 * the API, so an unlisted language is a catalogue gap, not a dead end.
 */
export const LANGUAGES: readonly string[] = [
  'English',
  'Hindi',
  'Assamese',
  'Bengali',
  'Bodo',
  'Dogri',
  'Gujarati',
  'Kannada',
  'Kashmiri',
  'Konkani',
  'Maithili',
  'Malayalam',
  'Manipuri',
  'Marathi',
  'Nepali',
  'Odia',
  'Punjabi',
  'Sanskrit',
  'Santali',
  'Sindhi',
  'Tamil',
  'Telugu',
  'Urdu',
  'Arabic',
  'Chinese (Mandarin)',
  'Dutch',
  'French',
  'German',
  'Italian',
  'Japanese',
  'Korean',
  'Portuguese',
  'Russian',
  'Spanish',
];

export const LANGUAGE_OPTIONS: ComboboxOption[] = LANGUAGES.map((l) => ({
  value: l,
  label: l,
}));

/**
 * Proficiency levels.
 *
 * The stored enum is BEGINNER / INTERMEDIATE / ADVANCED and is NOT being
 * renamed: `LanguageProficiency` is read by the admin console
 * (`apps/sadmin/lib/candidates/format.ts`), which belongs to another developer,
 * and a value rename would break their build for a label change. The labels the
 * owner asked for are applied here, at the edge.
 */
export const PROFICIENCY_LEVELS = [
  { value: 'BEGINNER', label: 'Beginner', hint: 'Basic phrases and simple exchanges' },
  { value: 'INTERMEDIATE', label: 'Proficient', hint: 'Comfortable in day-to-day work' },
  { value: 'ADVANCED', label: 'Expert', hint: 'Fluent, including technical discussion' },
] as const;

export type ProficiencyValue = (typeof PROFICIENCY_LEVELS)[number]['value'];

export function proficiencyLabel(value: string): string {
  return PROFICIENCY_LEVELS.find((p) => p.value === value)?.label ?? value;
}

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;
