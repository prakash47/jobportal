import { describe, expect, it } from 'vitest';
import { UpdateRecruiterJobDto } from './dto';

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
