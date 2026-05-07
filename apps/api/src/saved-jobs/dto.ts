import { z } from 'zod';

// SRS §4.4 — saved-jobs list. Page is 1-indexed; sort defaults to "date"
// (savedAt desc). Title sort lands later via a separate chip.
export const ListSavedJobsQueryDto = z.object({
  sort: z.enum(['date']).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type ListSavedJobsQuery = z.infer<typeof ListSavedJobsQueryDto>;
