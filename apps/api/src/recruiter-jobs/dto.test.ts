import { describe, expect, it } from 'vitest';
import { CreateRecruiterJobDto, UpdateRecruiterJobDto, missingPublishFields } from './dto';

// PATCH semantics: omitted = unchanged, null = clear (clearable fields only),
// and the same min<=max ordering guards create enforces.
describe('UpdateRecruiterJobDto', () => {
  it('accepts explicit null on the clearable fields (blank-in-edit-form → clear)', () => {
    const parsed = UpdateRecruiterJobDto.safeParse({
      shortDescription: null,
      industryId: null,
      salaryMinPaise: null,
      salaryMaxPaise: null,
      experienceMinYears: null,
      experienceMaxYears: null,
      qualifications: null,
      localityId: null,
      internshipDurationMonths: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects null on non-clearable required-for-publish fields', () => {
    expect(UpdateRecruiterJobDto.safeParse({ title: null }).success).toBe(false);
    expect(UpdateRecruiterJobDto.safeParse({ description: null }).success).toBe(false);
    expect(UpdateRecruiterJobDto.safeParse({ primaryCityId: null }).success).toBe(false);
    expect(UpdateRecruiterJobDto.safeParse({ functionalAreaId: null }).success).toBe(false);
  });

  it('rejects an inverted salary range (min > max), same as create', () => {
    const parsed = UpdateRecruiterJobDto.safeParse({
      salaryMinPaise: 200_000_00,
      salaryMaxPaise: 100_000_00,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an inverted experience range (min > max), same as create', () => {
    const parsed = UpdateRecruiterJobDto.safeParse({
      experienceMinYears: 30,
      experienceMaxYears: 2,
    });
    expect(parsed.success).toBe(false);
  });

  it('allows a one-sided range when the other side is null/omitted (null-aware guard)', () => {
    expect(UpdateRecruiterJobDto.safeParse({ salaryMinPaise: 100, salaryMaxPaise: null }).success).toBe(true);
    expect(UpdateRecruiterJobDto.safeParse({ experienceMaxYears: 5 }).success).toBe(true);
  });

  it('accepts a valid ordered range', () => {
    const parsed = UpdateRecruiterJobDto.safeParse({
      salaryMinPaise: 100_000_00,
      salaryMaxPaise: 200_000_00,
      experienceMinYears: 2,
      experienceMaxYears: 6,
    });
    expect(parsed.success).toBe(true);
  });

  it('stays strict — unknown keys are rejected', () => {
    expect(UpdateRecruiterJobDto.safeParse({ status: 'CLOSED' }).success).toBe(false);
    expect(UpdateRecruiterJobDto.safeParse({ publishMode: 'PUBLISH' }).success).toBe(false);
  });
});

// Going LIVE requires the full mandatory set at the API (the trust boundary) —
// not just title + description. DRAFT stays lenient. Mirrors publish()'s check.
describe('CreateRecruiterJobDto — publish requirements', () => {
  const liveFields = {
    title: 'Senior Frontend Engineer',
    description: 'Build the dashboard. ' + 'a'.repeat(50),
    functionalAreaId: 3,
    openings: 2,
    primaryCityId: 1,
  };

  it('DRAFT stays lenient — title + description only is valid', () => {
    const parsed = CreateRecruiterJobDto.safeParse({
      publishMode: 'DRAFT',
      title: liveFields.title,
      description: liveFields.description,
    });
    expect(parsed.success).toBe(true);
  });

  it('PUBLISH with every mandatory field parses', () => {
    expect(CreateRecruiterJobDto.safeParse({ publishMode: 'PUBLISH', ...liveFields }).success).toBe(
      true,
    );
  });

  it('PUBLISH missing city → rejected', () => {
    expect(
      CreateRecruiterJobDto.safeParse({
        publishMode: 'PUBLISH',
        title: liveFields.title,
        description: liveFields.description,
        functionalAreaId: 3,
        openings: 2,
      }).success,
    ).toBe(false);
  });

  it('PUBLISH missing department → rejected', () => {
    expect(
      CreateRecruiterJobDto.safeParse({
        publishMode: 'PUBLISH',
        title: liveFields.title,
        description: liveFields.description,
        openings: 2,
        primaryCityId: 1,
      }).success,
    ).toBe(false);
  });

  it('PUBLISH missing openings → rejected', () => {
    expect(
      CreateRecruiterJobDto.safeParse({
        publishMode: 'PUBLISH',
        title: liveFields.title,
        description: liveFields.description,
        functionalAreaId: 3,
        primaryCityId: 1,
      }).success,
    ).toBe(false);
  });

  it('PUBLISH error names exactly the missing fields (not the present ones)', () => {
    // department + city missing; openings present → message lists only the gaps.
    const res = CreateRecruiterJobDto.safeParse({
      publishMode: 'PUBLISH',
      title: liveFields.title,
      description: liveFields.description,
      openings: 2,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msg = res.error.issues.map((i) => i.message).join(' ');
      expect(msg).toContain('department');
      expect(msg).toContain('city');
      expect(msg).not.toContain('number of openings');
    }
  });
});

describe('missingPublishFields', () => {
  it('returns [] when every mandatory field is present + valid', () => {
    expect(
      missingPublishFields({
        title: 'Backend Engineer',
        description: 'x'.repeat(10),
        functionalAreaId: 1,
        openings: 1,
        primaryCityId: 1,
      }),
    ).toEqual([]);
  });

  it('labels every missing/invalid field (empty record)', () => {
    expect(missingPublishFields({})).toEqual([
      'title',
      'description',
      'department',
      'number of openings',
      'city',
    ]);
  });

  it('flags too-short title/description and openings < 1', () => {
    expect(
      missingPublishFields({ title: 'ab', description: 'short', openings: 0, functionalAreaId: 1, primaryCityId: 1 }),
    ).toEqual(['title', 'description', 'number of openings']);
  });
});
