import { z } from 'zod';

export const ApplyDto = z.object({
  jobId: z.number().int().positive(),
  coverLetter: z.string().max(5_000).optional(),
});

export type ApplyInput = z.infer<typeof ApplyDto>;

// SRS §4.6.2 — list filter. `status=ALL` (or absent) returns every status;
// otherwise narrows by enum value. Page is 1-indexed.
export const ListApplicationsQueryDto = z.object({
  status: z
    .enum([
      'ALL',
      'APPLIED',
      'IN_REVIEW',
      'SHORTLISTED',
      'INTERVIEWED',
      'OFFERED',
      'HIRED',
      'REJECTED',
      'WITHDRAWN',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type ListApplicationsQuery = z.infer<typeof ListApplicationsQueryDto>;
