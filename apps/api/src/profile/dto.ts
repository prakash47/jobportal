import { z } from 'zod';

// Per SRS §4.3.1 — every editable field on the profile is optional on PATCH;
// missing keys mean "no change". We use .optional() (not .nullish()) so
// passing `null` is rejected.

const yearInt = z.number().int().min(1950).max(2100);
const phoneRegex = /^[+0-9 \-()]{6,20}$/;

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
    expectedSalaryMaxPaise: z.number().int().min(0).optional(),
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
  })
  .strict()
  .refine(
    (v) =>
      v.expectedSalaryMinPaise === undefined ||
      v.expectedSalaryMaxPaise === undefined ||
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
  })
  .strict();
export type LanguageCreateInput = z.infer<typeof LanguageCreateDto>;
