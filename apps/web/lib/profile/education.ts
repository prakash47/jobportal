/**
 * Year ranges and validation for the education forms.
 *
 * Shared by the onboarding wizard's `EducationStep` and the dashboard's
 * `EducationManager` so the two cannot drift into accepting different years for
 * the same column.
 */

/** Matches the API's `yearInt` floor in apps/api/src/profile/dto.ts. */
export const MIN_YEAR = 1950;

/**
 * How far ahead an ENDING year may run.
 *
 * Someone currently pursuing a degree has a real expected graduation year in
 * the future, so the end-year list has to reach forward. Six years covers a
 * five-year integrated course started this year.
 */
export const FUTURE_END_YEARS = 6;

/**
 * Starting years: newest first, stopping at the current year.
 *
 * A start year cannot be in the future — you have not started yet — and
 * offering 2027–2032 there was the reported bug. The ending year is a separate
 * list precisely because the same rule does not apply to it.
 */
export function startYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = currentYear; y >= MIN_YEAR; y--) years.push(y);
  return years;
}

/** Ending years: newest first, reaching FUTURE_END_YEARS ahead for expected graduation. */
export function endYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = currentYear + FUTURE_END_YEARS; y >= MIN_YEAR; y--) years.push(y);
  return years;
}

export interface EduDraft {
  id: number | null;
  institute: string;
  degree: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  grade: string;
  pursuing: boolean;
}

export const emptyEduDraft: EduDraft = {
  id: null,
  institute: '',
  degree: '',
  fieldOfStudy: '',
  startYear: '',
  endYear: '',
  grade: '',
  pursuing: false,
};

/**
 * A section nobody has touched. Skipped on save, not reported as invalid.
 *
 * This checks EVERY field, not just `institute`. Checking only the institute is
 * what silently discarded a partly-filled card: type a degree name, leave the
 * college blank, hit Save, and the form reported "Saved" while writing nothing
 * — the reported "filled details lost after save". A card with anything in it
 * is now either saved or explained.
 */
export function isBlank(draft: EduDraft): boolean {
  return (
    draft.institute.trim() === '' &&
    draft.degree.trim() === '' &&
    draft.fieldOfStudy.trim() === '' &&
    draft.grade.trim() === '' &&
    draft.startYear === '' &&
    draft.endYear === '' &&
    !draft.pursuing
  );
}

/**
 * Validate one section, returning an error message or null.
 *
 * `label` is woven into the message because the dashboard renders several
 * degree cards at once — "Please select a starting year" alone would not say
 * which card is at fault.
 */
export function validateEduDraft(
  draft: EduDraft,
  opts: {
    label: string;
    requireDegreeName: boolean;
    class12Sentinel: string;
    /** Omit to skip the future-date checks (used by tests that pin other rules). */
    currentYear?: number;
  },
): string | null {
  if (isBlank(draft)) return null;

  if (opts.requireDegreeName) {
    const name = draft.degree.trim();
    if (!name) return `${opts.label}: enter the degree name.`;
    if (name.toLowerCase() === opts.class12Sentinel.toLowerCase()) {
      return `${opts.label}: enter a specific degree name (not "${opts.class12Sentinel}").`;
    }
  }

  // Now reachable, because a card with a degree but no institute is no longer
  // treated as untouched.
  if (!draft.institute.trim()) {
    return `${opts.label}: enter the ${opts.requireDegreeName ? 'college' : 'school'} name.`;
  }

  if (!draft.startYear) return `${opts.label}: select a starting year.`;
  const startYear = Number(draft.startYear);

  // A start year cannot be in the future — you have not started yet. The
  // dropdown already stops at the current year, but a value can reach this
  // function from a row saved before that cap existed, and the API is the
  // real gate (see apps/api/src/profile/dto.ts).
  if (opts.currentYear !== undefined && startYear > opts.currentYear) {
    return `${opts.label}: the starting year cannot be in the future.`;
  }

  if (!draft.pursuing) {
    if (!draft.endYear) return `${opts.label}: select an ending year, or tick "Currently pursuing".`;
    if (Number(draft.endYear) < startYear) {
      return `${opts.label}: the ending year must be the same as or after the starting year.`;
    }
    // A COMPLETED qualification cannot end in the future. An expected
    // graduation date is what "Currently pursuing" is for, and that path
    // leaves endYear null.
    if (opts.currentYear !== undefined && Number(draft.endYear) > opts.currentYear) {
      return `${opts.label}: an ending year in the future means you are still studying — tick "Currently pursuing" instead.`;
    }
  }
  return null;
}

/**
 * At most one qualification may be in progress.
 *
 * Owner's rule, and it holds: Class 12 and a degree cannot both be underway,
 * and two simultaneous full-time degrees is a data-entry mistake far more often
 * than a fact. Returns a message or null.
 */
export function validateSinglePursuing(
  sections: ReadonlyArray<{ label: string; draft: EduDraft }>,
): string | null {
  const pursuing = sections.filter((s) => !isBlank(s.draft) && s.draft.pursuing);
  if (pursuing.length <= 1) return null;
  return `Only one qualification can be marked "currently pursuing" — ${pursuing
    .map((s) => s.label)
    .join(' and ')} are both ticked.`;
}

/** Build the POST/PATCH body for one section. */
export function toEducationBody(
  draft: EduDraft,
  degreeName: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    institute: draft.institute.trim(),
    degree: degreeName,
    startYear: Number(draft.startYear),
  };
  if (draft.fieldOfStudy.trim()) body['fieldOfStudy'] = draft.fieldOfStudy.trim();
  // null ⇔ ongoing. Sent explicitly so unticking "currently pursuing" on an
  // existing row can clear a stale end year rather than leaving it behind.
  body['endYear'] = draft.pursuing ? null : Number(draft.endYear);
  if (draft.grade.trim()) body['grade'] = draft.grade.trim();
  return body;
}
