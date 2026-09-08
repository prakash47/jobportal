import { describe, expect, it } from 'vitest';
import {
  EducationCreateDto,
  EducationUpdateDto,
  ExperienceCreateDto,
  ExperienceUpdateDto,
  LanguageCreateDto,
  ProfilePatchDto,
  ProjectCreateDto,
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

  it('Create accepts a null endYear (currently pursuing)', () => {
    expect(
      EducationCreateDto.safeParse({ institute: 'X', degree: 'Y', startYear: 2020, endYear: null })
        .success,
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

describe('ProfilePatchDto — employment & professional fields', () => {
  it('accepts the new onboarding fields', () => {
    expect(
      ProfilePatchDto.safeParse({
        workStatus: 'EXPERIENCED',
        lookingFor: 'BOTH',
        currentCompanyName: 'Acme',
        currentCityName: 'Mumbai, Maharashtra',
        industryId: 3,
        experienceMonths: 42,
        currentSalaryPaise: 80_000_000,
        noticePeriodDays: 30,
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid workStatus enum', () => {
    expect(ProfilePatchDto.safeParse({ workStatus: 'SENIOR' }).success).toBe(false);
  });

  it('rejects a non-positive industryId', () => {
    expect(ProfilePatchDto.safeParse({ industryId: 0 }).success).toBe(false);
  });
});

describe('SkillsUpdateDto', () => {
  it('rejects more than 50 skills', () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    expect(SkillsUpdateDto.safeParse({ skillIds: ids }).success).toBe(false);
  });

  it('accepts an empty patch (both fields optional)', () => {
    expect(SkillsUpdateDto.safeParse({}).success).toBe(true);
  });

  it('accepts free-text customSkills', () => {
    expect(
      SkillsUpdateDto.safeParse({ skillIds: [1, 2], customSkills: ['GraphQL', 'tRPC'] }).success,
    ).toBe(true);
  });

  it('rejects a blank custom skill', () => {
    expect(SkillsUpdateDto.safeParse({ customSkills: ['   '] }).success).toBe(false);
  });
});

describe('ProjectCreateDto', () => {
  it('accepts a full project', () => {
    expect(
      ProjectCreateDto.safeParse({
        title: 'Portfolio site',
        description: 'My personal site',
        techStack: ['Next.js', 'Tailwind'],
        url: 'https://example.com',
      }).success,
    ).toBe(true);
  });

  it('accepts a title-only project', () => {
    expect(ProjectCreateDto.safeParse({ title: 'Side project' }).success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(ProjectCreateDto.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a malformed url', () => {
    expect(ProjectCreateDto.safeParse({ title: 'X', url: 'not-a-url' }).success).toBe(false);
  });

  it('rejects a javascript: scheme url (stored-XSS guard)', () => {
    expect(ProjectCreateDto.safeParse({ title: 'X', url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects a data: scheme url', () => {
    expect(
      ProjectCreateDto.safeParse({ title: 'X', url: 'data:text/html,<script>1</script>' }).success,
    ).toBe(false);
  });

  it('accepts an https url', () => {
    expect(ProjectCreateDto.safeParse({ title: 'X', url: 'https://example.com' }).success).toBe(true);
  });
});

describe('LanguageCreateDto', () => {
  it('accepts a valid language', () => {
    expect(LanguageCreateDto.safeParse({ name: 'Hindi', proficiency: 'INTERMEDIATE' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown proficiency', () => {
    expect(LanguageCreateDto.safeParse({ name: 'Hindi', proficiency: 'FLUENT' }).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(LanguageCreateDto.safeParse({ name: '', proficiency: 'BEGINNER' }).success).toBe(false);
  });
});

describe('ProfilePatchDto — personal-details fields', () => {
  const dob = (v: string) => ProfilePatchDto.safeParse({ dateOfBirth: v });

  it('accepts a plausible date-only birthday', () => {
    expect(dob('1998-05-12').success).toBe(true);
  });

  it('rejects a timestamp — a birthday is a calendar date, not an instant', () => {
    expect(dob('1998-05-12T00:00:00.000Z').success).toBe(false);
  });

  it('rejects an impossible calendar date', () => {
    // new Date('2025-02-30') silently rolls into March, so without the
    // round-trip guard this would validate.
    expect(dob('2025-02-30').success).toBe(false);
    expect(dob('2025-13-01').success).toBe(false);
  });

  it('rejects someone too young to work and a mistyped century', () => {
    const nextYear = String(new Date().getUTCFullYear() + 1);
    expect(dob(`${nextYear}-01-01`).success).toBe(false);
    expect(dob('2020-01-01').success).toBe(false);
    expect(dob('1850-01-01').success).toBe(false);
  });

  it('takes a nationality and a current city id', () => {
    expect(ProfilePatchDto.safeParse({ nationality: 'Indian' }).success).toBe(true);
    expect(ProfilePatchDto.safeParse({ currentCityId: 6 }).success).toBe(true);
    expect(ProfilePatchDto.safeParse({ currentCityId: 0 }).success).toBe(false);
    expect(ProfilePatchDto.safeParse({ nationality: '' }).success).toBe(false);
  });

  it('lets every optional field be cleared with null', () => {
    // Originally only the MAX was nullable, so the single Expected-LPA box
    // could clear a leftover from the old two-box form. That was too narrow:
    // an omitted key means "no change" on a PATCH, so with the rest
    // non-nullable there was no way to erase a phone number, a headline or a
    // salary at all — the reported "deleted info comes back".
    expect(
      ProfilePatchDto.safeParse({ expectedSalaryMinPaise: 2_400_000_00, expectedSalaryMaxPaise: null })
        .success,
    ).toBe(true);
    for (const field of [
      'phone',
      'headline',
      'summary',
      'experienceMonths',
      'currentTitle',
      'currentSalaryPaise',
      'expectedSalaryMinPaise',
      'noticePeriodDays',
      'nationality',
      'currentCityId',
      'gender',
      'dateOfBirth',
    ]) {
      expect(ProfilePatchDto.safeParse({ [field]: null }).success).toBe(true);
    }
  });

  it('still refuses to clear the name — a profile with no name shows a recruiter nothing', () => {
    expect(ProfilePatchDto.safeParse({ name: null }).success).toBe(false);
    expect(ProfilePatchDto.safeParse({ name: '' }).success).toBe(false);
  });

  it('does not let a null minimum defeat the min <= max check', () => {
    expect(
      ProfilePatchDto.safeParse({ expectedSalaryMinPaise: null, expectedSalaryMaxPaise: 100 })
        .success,
    ).toBe(true);
  });

  it('still enforces min <= max when both are present', () => {
    expect(
      ProfilePatchDto.safeParse({ expectedSalaryMinPaise: 500, expectedSalaryMaxPaise: 100 }).success,
    ).toBe(false);
  });
});

describe('LanguageCreateDto — read/write/speak', () => {
  const base = { name: 'Marathi', proficiency: 'ADVANCED' as const };

  it('still accepts the onboarding wizard payload with no skill flags', () => {
    expect(LanguageCreateDto.safeParse(base).success).toBe(true);
  });

  it('accepts a partial skill set', () => {
    expect(
      LanguageCreateDto.safeParse({ ...base, canRead: true, canWrite: false, canSpeak: true }).success,
    ).toBe(true);
  });

  it('rejects all three unchecked — that claims nothing', () => {
    expect(
      LanguageCreateDto.safeParse({ ...base, canRead: false, canWrite: false, canSpeak: false })
        .success,
    ).toBe(false);
  });
});

describe('Experience DTOs — career break', () => {
  const base = {
    companyName: 'Career break',
    title: 'Parental leave',
    startDate: '2023-01-01T00:00:00.000Z',
    endDate: '2023-09-01T00:00:00.000Z',
  };

  it('accepts the career-break flag', () => {
    expect(ExperienceCreateDto.safeParse({ ...base, isCareerBreak: true }).success).toBe(true);
  });

  it('still accepts a payload without it, so existing clients keep working', () => {
    expect(ExperienceCreateDto.safeParse(base).success).toBe(true);
  });

  it('rejects a non-boolean', () => {
    expect(ExperienceCreateDto.safeParse({ ...base, isCareerBreak: 'yes' }).success).toBe(false);
  });

  it('is patchable on its own', () => {
    expect(ExperienceUpdateDto.safeParse({ isCareerBreak: true }).success).toBe(true);
  });

  it('still refuses an endDate alongside isCurrent', () => {
    // The manager omits endDate when the role is ongoing precisely because of
    // this rule; a regression here would surface as a 400 on every current role.
    expect(
      ExperienceCreateDto.safeParse({ ...base, isCurrent: true, isCareerBreak: true }).success,
    ).toBe(false);
  });
});

describe('Education DTOs — future years', () => {
  const year = new Date().getUTCFullYear();
  const base = { institute: 'IIT Bombay', degree: 'B.Tech' };

  it('rejects a starting year in the future', () => {
    // Reproduced against the running API before this refine existed:
    // POST /me/education with startYear 2029 returned 201.
    const r = EducationCreateDto.safeParse({ ...base, startYear: year + 3, endYear: year + 4 });
    expect(r.success).toBe(false);
  });

  it('accepts the current year as a start', () => {
    expect(EducationCreateDto.safeParse({ ...base, startYear: year }).success).toBe(true);
  });

  it('allows a modest future ending year, for a degree in progress', () => {
    expect(
      EducationCreateDto.safeParse({ ...base, startYear: year - 1, endYear: year + 3 }).success,
    ).toBe(true);
  });

  it('rejects an absurd ending year', () => {
    expect(
      EducationCreateDto.safeParse({ ...base, startYear: year - 1, endYear: year + 40 }).success,
    ).toBe(false);
  });

  it('still accepts null endYear for currently pursuing', () => {
    expect(
      EducationCreateDto.safeParse({ ...base, startYear: year - 1, endYear: null }).success,
    ).toBe(true);
  });

  it('applies the same bound on update', () => {
    expect(EducationUpdateDto.safeParse({ startYear: year + 3 }).success).toBe(false);
    expect(EducationUpdateDto.safeParse({ startYear: year - 5 }).success).toBe(true);
  });
});
