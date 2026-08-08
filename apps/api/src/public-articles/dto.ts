import { z } from 'zod';

// Query contract for GET /v1/career-advice.
//
// The MAPPING is not re-implemented here — the controller hands these to
// `parseArticleIndexParams` from @jobportal/domain, the same function the
// website's index uses, so the tag slug rule, the 80-char q cap and the page
// floor stay byte-identical across both surfaces.
//
// Deliberately ABSENT: `status`. The PUBLISHED gate is pinned server-side in
// the service; there is no client-facing way to ask for a draft.
export const ListArticlesQueryDto = z
  .object({
    tag: z.string().trim().min(1).max(80).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export type ListArticlesQuery = z.infer<typeof ListArticlesQueryDto>;
