import { describe, expect, it } from 'vitest';
import {
  emptyEduDraft,
  endYearOptions,
  FUTURE_END_YEARS,
  isBlank,
  MIN_YEAR,
  startYearOptions,
  toEducationBody,
  validateEduDraft,
  type EduDraft,
} from './education';

const CLASS12 = 'Class XII';
const opts = { label: 'First degree', requireDegreeName: true, class12Sentinel: CLASS12 };

const draft = (over: Partial<EduDraft> = {}): EduDraft => ({
  ...emptyEduDraft,
  institute: 'IIT Bombay',
  degree: 'B.Tech',
  startYear: '2018',
  endYear: '2022',
  ...over,
});

describe('startYearOptions', () => {
  it('stops at the current year — a start year cannot be in the future', () => {
    const years = startYearOptions(2026);
    expect(years[0]).toBe(2026);
    expect(years).not.toContain(2027);
    expect(years).not.toContain(2032);
  });

  it('runs back to the API floor', () => {
    const years = startYearOptions(2026);
    expect(years.at(-1)).toBe(MIN_YEAR);
    expect(years).toHaveLength(2026 - MIN_YEAR + 1);
  });

  it('is ordered newest first', () => {
    const years = startYearOptions(2026);
    expect(years.slice(0, 3)).toEqual([2026, 2025, 2024]);
  });
});

describe('endYearOptions', () => {
  it('does reach into the future, because expected graduation is a real date', () => {
    const years = endYearOptions(2026);
    expect(years[0]).toBe(2026 + FUTURE_END_YEARS);
    expect(years).toContain(2030);
  });

  it('shares the same floor as the start list', () => {
    expect(endYearOptions(2026).at(-1)).toBe(MIN_YEAR);
  });
});

describe('isBlank', () => {
  it('treats a section with no institute as unfilled', () => {
    expect(isBlank(emptyEduDraft)).toBe(true);
    expect(isBlank(draft({ institute: '   ' }))).toBe(true);
    expect(isBlank(draft())).toBe(false);
  });
});

describe('validateEduDraft', () => {
  it('passes a complete section', () => {
    expect(validateEduDraft(draft(), opts)).toBeNull();
  });

  it('skips a blank section entirely rather than complaining about it', () => {
    expect(validateEduDraft(emptyEduDraft, opts)).toBeNull();
  });

  it('requires a degree name only where one is asked for', () => {
    expect(validateEduDraft(draft({ degree: '' }), opts)).toMatch(/degree name/);
    expect(
      validateEduDraft(draft({ degree: '' }), { ...opts, requireDegreeName: false }),
    ).toBeNull();
  });

  it('rejects the Class 12 sentinel as a typed degree name', () => {
    // The sentinel discriminates the Class 12 row; letting someone type it into
    // a degree card would make two rows indistinguishable on the next load.
    expect(validateEduDraft(draft({ degree: 'Class XII' }), opts)).toMatch(/specific degree name/);
    expect(validateEduDraft(draft({ degree: 'class xii' }), opts)).toMatch(/specific degree name/);
  });

  it('requires a start year', () => {
    expect(validateEduDraft(draft({ startYear: '' }), opts)).toMatch(/starting year/);
  });

  it('requires an end year unless currently pursuing', () => {
    expect(validateEduDraft(draft({ endYear: '' }), opts)).toMatch(/ending year/);
    expect(validateEduDraft(draft({ endYear: '', pursuing: true }), opts)).toBeNull();
  });

  it('rejects an end year before the start year', () => {
    expect(validateEduDraft(draft({ startYear: '2022', endYear: '2018' }), opts)).toMatch(
      /same as or after/,
    );
    expect(validateEduDraft(draft({ startYear: '2022', endYear: '2022' }), opts)).toBeNull();
  });

  it('names the section in the message, since several render at once', () => {
    const msg = validateEduDraft(draft({ startYear: '' }), { ...opts, label: 'Degree 2' });
    expect(msg).toMatch(/^Degree 2:/);
  });
});

describe('toEducationBody', () => {
  it('builds the API shape', () => {
    expect(toEducationBody(draft({ fieldOfStudy: 'CS', grade: '8.5' }), 'B.Tech')).toEqual({
      institute: 'IIT Bombay',
      degree: 'B.Tech',
      startYear: 2018,
      fieldOfStudy: 'CS',
      endYear: 2022,
      grade: '8.5',
    });
  });

  it('sends endYear null when pursuing, so unticking can clear a stale year', () => {
    const body = toEducationBody(draft({ pursuing: true, endYear: '2022' }), 'B.Tech');
    expect(body['endYear']).toBeNull();
  });

  it('always sends endYear rather than omitting it', () => {
    // Omitting the key means "no change" on PATCH, which would leave a stale
    // end year on a row the user just marked as ongoing.
    expect(Object.keys(toEducationBody(draft({ pursuing: true }), 'B.Tech'))).toContain('endYear');
  });

  it('omits optional text fields that are empty', () => {
    const body = toEducationBody(draft(), 'B.Tech');
    expect(body).not.toHaveProperty('fieldOfStudy');
    expect(body).not.toHaveProperty('grade');
  });

  it('takes the degree name from the caller, so Class 12 can pass its sentinel', () => {
    expect(toEducationBody(draft({ degree: '' }), CLASS12)['degree']).toBe(CLASS12);
  });
});
