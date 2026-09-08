import { z } from 'zod';

// Per SRS §4.3.1 — every editable field on the profile is optional on PATCH;
// missing keys mean "no change". We use .optional() (not .nullish()) so
// passing `null` is rejected.

const yearInt = z.number().int().min(1950).max(2100);
const phoneRegex = /^[+0-9 \-()]{6,20}$/;

// Bounds for a birth date. The floor is India's minimum working age under the
// Child Labour (Prohibition and Regulation) Act; the ceiling is a sanity guard
// against a mistyped year. Both are checked against UTC so the answer does not
// depend on where the API process happens to run.
const MIN_AGE_YEARS = 14;
const MAX_AGE_YEARS = 100;

export function isPlausibleBirthDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip guard: `new Date('2025-02-30')` silently rolls into March, so
  // an impossible calendar date would otherwise validate.
  if (parsed.toISOString().slice(0, 10) !== value) return false;

  const now = new Date();
  const oldest = Date.UTC(now.getUTCFullYear() - MAX_AGE_YEARS, now.getUTCMonth(), now.getUTCDate());
  const youngest = Date.UTC(
    now.getUTCFullYear() - MIN_AGE_YEARS,
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return parsed.getTime() >= oldest && parsed.getTime() <= youngest;
}

export const ProfilePatchDto = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().regex(phoneRegex).optional(),
    headline: z.string().max(250).optional(),
    summary: z.string().max(5_000).optional(),
    experienceMonths: z.number().int().min(0).max(720).optional(),
    currentTitle: z.string().max(120).optional(),
    currentCompanyId: z.number().int().positive().optional(),
    currentSalaryPaise: z.number().int().min(0).optional(),
    expectedSalaryMinPaise: z.number().int().min(0).optional(),
    // Nullable, unlike every other field here: the personal-details page now
    // collects ONE expected-salary figure, so it must be able to clear a max
    // left behind by the old two-box form. Without this the seeker would see a
    // single number while recruiters kept seeing a stale range.
    expectedSalaryMaxPaise: z.number().int().min(0).nullable().optional(),
    noticePeriodDays: z.number().int().min(0).max(365).optional(),
    preferredCityIds: z.array(z.number().int().positive()).max(10).optional(),
    preferredWorkModes: z.array(z.enum(['ONSITE', 'REMOTE', 'HYBRID'])).max(3).optional(),
    preferredJobTypes: z
      .array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN']))
      .max(4)
      .optional(),
    // Onboarding "Employment & Professional" step (SRS §4.3). Current company /
    // city are free text; industry links to the catalogue.
    workStatus: z.enum(['FRESHER', 'EXPERIENCED']).optional(),
    lookingFor: z.enum(['JOB', 'INTERNSHIP', 'BOTH']).optional(),
    currentCompanyName: z.string().max(150).optional(),
    currentCityName: z.string().max(120).optional(),
    industryId: z.number().int().positive().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']).optional(),
    // Personal-details page (SRS §4.3).
    //
    // Date-only on the wire (YYYY-MM-DD), never a timestamp: a birthday is a
    // calendar fact, and accepting an instant would let the same DOB land on
    // two different days for two users in different timezones. The service
    // pins it to UTC midnight.
    dateOfBirth: z
      .iso
      .date()
      .refine((v) => isPlausibleBirthDate(v), {
        message: 'dateOfBirth must be a real past date for someone aged 14-100',
      })
      .optional(),
    nationality: z.string().trim().min(1).max(60).optional(),
    currentCityId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.expectedSalaryMinPaise === undefined ||
      v.expectedSalaryMaxPaise === undefined ||
      v.expectedSalaryMaxPaise === null ||
      v.expectedSalaryMinPaise <= v.expectedSalaryMaxPaise,
    { message: 'expectedSalaryMinPaise must be <= expectedSalaryMaxPaise' },
  );
export type ProfilePatchInput = z.infer<typeof ProfilePatchDto>;

// Base shape without refinements so the Update variant can call .partial().
// Cross-field rules (endYear >= startYear etc.) are reattached on the Create
// DTO and re-checked on Update at the service layer.
const educationBase = z
  .object({
    institute: z.string().min(1).max(200),
    degree: z.string().min(1).max(120),
    fieldOfStudy: z.string().max(120).optional(),
    startYear: yearInt,
    // Nullable so "currently pursuing" can be stored/cleared as endYear: null
    // (null ⇔ ongoing). undefined means "no change" on PATCH.
    endYear: yearInt.nullable().optional(),
    grade: z.string().max(40).optional(),
  })
  .strict();

export const EducationCreateDto = educationBase.refine(
  (v) => v.endYear === undefined || v.endYear === null || v.endYear >= v.startYear,
  { message: 'endYear must be >= startYear' },
);
export type EducationCreateInput = z.infer<typeof EducationCreateDto>;

export const EducationUpdateDto = educationBase.partial().refine(
  (v) =>
    v.startYear === undefined ||
    v.endYear === undefined ||
    v.endYear === null ||
    v.endYear >= v.startYear,
  { message: 'endYear must be >= startYear' },
);
export type EducationUpdateInput = z.infer<typeof EducationUpdateDto>;

const experienceBase = z
  .object({
    companyName: z.string().min(1).max(200),
    title: z.string().min(1).max(120),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime().optional(),
    isCurrent: z.boolean().optional(),
    // A deliberate employment gap rather than a role. The reason goes in
    // `title` and `companyName` carries a constant label, because companyName
    // is non-null and is read by the recruiter and admin apps.
    isCareerBreak: z.boolean().optional(),
    description: z.string().max(2_000).optional(),
  })
  .strict();

export const ExperienceCreateDto = experienceBase
  .refine((v) => !(v.isCurrent === true && v.endDate !== undefined), {
    message: 'endDate must be omitted when isCurrent is true',
  })
  .refine((v) => v.endDate === undefined || new Date(v.endDate) >= new Date(v.startDate), {
    message: 'endDate must be >= startDate',
  });
export type ExperienceCreateInput = z.infer<typeof ExperienceCreateDto>;

export const ExperienceUpdateDto = experienceBase
  .partial()
  .refine((v) => !(v.isCurrent === true && v.endDate !== undefined), {
    message: 'endDate must be omitted when isCurrent is true',
  })
  .refine(
    (v) =>
      v.startDate === undefined ||
      v.endDate === undefined ||
      new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate must be >= startDate' },
  );
export type ExperienceUpdateInput = z.infer<typeof ExperienceUpdateDto>;

// Onboarding skills step (SRS §4.3) accepts both catalogue ids and free-text
// names. customSkills are find-or-created server-side (see skills.service); the
// combined total is capped at 50 there.
export const SkillsUpdateDto = z
  .object({
    skillIds: z.array(z.number().int().positive()).max(50).optional(),
    customSkills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  })
  .strict();
export type SkillsUpdateInput = z.infer<typeof SkillsUpdateDto>;

// SRS §4.3 — candidate portfolio project. techStack is free-text tags.
export const ProjectCreateDto = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().max(2_000).optional(),
    techStack: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    url: z
      .string()
      .trim()
      .url()
      .max(500)
      // Restrict to web schemes — `.url()` alone accepts javascript:/data: URLs,
      // which become a stored-XSS sink when rendered as an <a href> (SRS §9).
      .refine((u) => /^https?:\/\//i.test(u), {
        message: 'URL must start with http:// or https://',
      })
      .optional(),
  })
  .strict();
export type ProjectCreateInput = z.infer<typeof ProjectCreateDto>;

// SRS §4.3 — a candidate language + self-rated proficiency.
export const LanguageCreateDto = z
  .object({
    name: z.string().trim().min(1).max(60),
    proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
    // Which of the three skills the candidate claims. Optional so the
    // onboarding wizard's existing two-field payload keeps working; the column
    // defaults to true, matching what those rows already meant.
    canRead: z.boolean().optional(),
    canWrite: z.boolean().optional(),
    canSpeak: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.canRead !== false || v.canWrite !== false || v.canSpeak !== false, {
    message: 'Select at least one of read, write or speak',
  });
export type LanguageCreateInput = z.infer<typeof LanguageCreateDto>;
