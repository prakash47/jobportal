import { z } from 'zod';

// The directory query. The MAPPING is not re-implemented here — the service
// hands these to `parseDirectoryParams` from @jobportal/domain, the same
// function the website's directory uses, so "sort=reviews" and an unknown
// category behave identically on both surfaces.
//
// This DTO's only job is to reject shapes the shared parser would silently
// coerce, and to bound `page` so a crafted value cannot become an enormous
// OFFSET.
export const ListCompaniesQueryDto = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    sort: z.enum(['rating', 'name', 'reviews']).optional(),
    // Accepts the website's own '1'/'true' spellings; the shared parser owns
    // the actual truthiness rule.
    hiring: z.enum(['0', '1', 'true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export type ListCompaniesQuery = z.infer<typeof ListCompaniesQueryDto>;
