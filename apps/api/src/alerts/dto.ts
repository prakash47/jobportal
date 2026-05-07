import { z } from 'zod';

// SRS §4.5.1 — saved query shape. Mirrors a subset of the SearchJobsParams
// the worker passes into @jobportal/search.searchJobs at scan time.
export const AlertQueryDto = z
  .object({
    q: z.string().max(200).optional(),
    skillSlugs: z.array(z.string().min(1).max(60)).max(20).optional(),
    citySlugs: z.array(z.string().min(1).max(60)).max(10).optional(),
    minExperienceMonths: z.number().int().min(0).max(720).optional(),
    maxExperienceMonths: z.number().int().min(0).max(720).optional(),
    salaryMin: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.minExperienceMonths === undefined ||
      v.maxExperienceMonths === undefined ||
      v.minExperienceMonths <= v.maxExperienceMonths,
    { message: 'minExperienceMonths must be <= maxExperienceMonths' },
  );
export type AlertQueryInput = z.infer<typeof AlertQueryDto>;

const frequencyEnum = z.enum(['instant', 'daily', 'weekly']);

const baseAlert = z
  .object({
    name: z.string().min(1).max(120),
    query: AlertQueryDto,
    frequency: frequencyEnum,
    isActive: z.boolean().optional(),
  })
  .strict();

export const AlertCreateDto = baseAlert;
export type AlertCreateInput = z.infer<typeof AlertCreateDto>;

// .partial() is safe here because baseAlert has no .refine() — cross-field
// rules live inside AlertQueryDto, which we re-validate as a whole when
// `query` is present on a patch.
export const AlertUpdateDto = baseAlert.partial();
export type AlertUpdateInput = z.infer<typeof AlertUpdateDto>;
