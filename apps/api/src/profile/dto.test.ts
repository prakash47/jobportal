import { describe, expect, it } from 'vitest';
import {
  EducationCreateDto,
  EducationUpdateDto,
  ExperienceCreateDto,
  ExperienceUpdateDto,
  ProfilePatchDto,
  SkillsUpdateDto,
} from './dto';

// These tests pin the Zod 4 quirk that .partial() blows up on schemas with
// .refine() — guard against a regression that would crash the Nest API at
// module-load time.

describe('Education DTOs', () => {
  it('Create accepts a valid row', () => {
    expect(
      EducationCreateDto.safeParse({
        institute: 'IIT Bombay',
        degree: 'B.Tech',
        startYear: 2014,
        endYear: 2018,
      }).success,
    ).toBe(true);
  });

  it('Create rejects endYear before startYear', () => {
    expect(
      EducationCreateDto.safeParse({
        institute: 'X',
        degree: 'Y',
        startYear: 2020,
        endYear: 2018,
      }).success,
    ).toBe(false);
  });

  it('Update accepts a partial patch', () => {
    expect(EducationUpdateDto.safeParse({ grade: 'A' }).success).toBe(true);
    expect(EducationUpdateDto.safeParse({}).success).toBe(true);
  });

  it('Update rejects reverse-year combo when both supplied', () => {
    expect(
      EducationUpdateDto.safeParse({ startYear: 2020, endYear: 2018 }).success,
    ).toBe(false);
  });
});

describe('Experience DTOs', () => {
  const valid = {
    companyName: 'Acme',
    title: 'Engineer',
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2025-01-01T00:00:00.000Z',
  };

  it('Create accepts valid rows', () => {
    expect(ExperienceCreateDto.safeParse(valid).success).toBe(true);
  });

  it('Create rejects endDate < startDate', () => {
    expect(
      ExperienceCreateDto.safeParse({
        ...valid,
        endDate: '2023-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('Create rejects endDate present when isCurrent=true', () => {
    expect(
      ExperienceCreateDto.safeParse({ ...valid, isCurrent: true }).success,
    ).toBe(false);
  });

  it('Update accepts an empty patch', () => {
    expect(ExperienceUpdateDto.safeParse({}).success).toBe(true);
  });

  it('Update enforces date order when both fields are supplied', () => {
    expect(
      ExperienceUpdateDto.safeParse({
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2024-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('ProfilePatchDto', () => {
  it('rejects expectedMin > expectedMax', () => {
    expect(
      ProfilePatchDto.safeParse({
        expectedSalaryMinPaise: 2_000_000_00,
        expectedSalaryMaxPaise: 1_000_000_00,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(ProfilePatchDto.safeParse({ rogue: 1 }).success).toBe(false);
  });
});

describe('SkillsUpdateDto', () => {
  it('rejects more than 50 skills', () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    expect(SkillsUpdateDto.safeParse({ skillIds: ids }).success).toBe(false);
  });
});
