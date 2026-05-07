import { z } from 'zod';

export const ApplyDto = z.object({
  jobId: z.number().int().positive(),
  coverLetter: z.string().max(5_000).optional(),
});

export type ApplyInput = z.infer<typeof ApplyDto>;
