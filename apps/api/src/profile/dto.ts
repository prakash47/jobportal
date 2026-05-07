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
    headline: z.string().max(200).optional(),
    summary: z.string().max(5_000).optional(),
    experienceMonths: z.number().int().min(0).max(720).optional(),
    currentTitle: z.string().max(120).optional(),
    currentCompanyId: z.number().int().positive().optional(),
    currentSalaryPaise: z.number().int().min(0).optional(),
    expectedSalaryMinPaise: z.number().int().min(0).optional(),
    expectedSalaryMaxPaise: z.number().int().min(0).optional(),
    noticePeriodDays: z.number().int().min(0).max(365).optional(),
    preferredCityIds: z.array(z.number().int().positive()).max(10).optional(),
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

export const EducationCreateDto = z
  .object({
    institute: z.string().min(1).max(200),
    degree: z.string().min(1).max(120),
    fieldOfStudy: z.string().max(120).optional(),
    startYear: yearInt,
    endYear: yearInt.optional(),
    grade: z.string().max(40).optional(),
  })
  .strict()
  .refine((v) => v.endYear === undefined || v.endYear >= v.startYear, {
    message: 'endYear must be >= startYear',
  });
export type EducationCreateInput = z.infer<typeof EducationCreateDto>;

export const EducationUpdateDto = EducationCreateDto.partial();
export type EducationUpdateInput = z.infer<typeof EducationUpdateDto>;

export const ExperienceCreateDto = z
  .object({
    companyName: z.string().min(1).max(200),
    title: z.string().min(1).max(120),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime().optional(),
    isCurrent: z.boolean().optional(),
    description: z.string().max(2_000).optional(),
  })
  .strict()
  .refine((v) => !(v.isCurrent === true && v.endDate !== undefined), {
    message: 'endDate must be omitted when isCurrent is true',
  })
  .refine((v) => v.endDate === undefined || new Date(v.endDate) >= new Date(v.startDate), {
    message: 'endDate must be >= startDate',
  });
export type ExperienceCreateInput = z.infer<typeof ExperienceCreateDto>;

export const ExperienceUpdateDto = ExperienceCreateDto.partial();
export type ExperienceUpdateInput = z.infer<typeof ExperienceUpdateDto>;

export const SkillsUpdateDto = z
  .object({
    skillIds: z.array(z.number().int().positive()).max(50),
  })
  .strict();
export type SkillsUpdateInput = z.infer<typeof SkillsUpdateDto>;
