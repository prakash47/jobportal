import { z } from 'zod';
import { isInt32Id } from '../common/int32';

/** Default page size, matching the other list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Max rows in one response.
 *
 * DELIBERATE DIVERGENCE from the fixed 20 the other list endpoints use, and
 * the owner should know why: these are reference tables a picker wants in ONE
 * round trip, not a feed a user scrolls. The web onboarding wizard downloads
 * the entire catalogue and filters client-side; a phone on Indian mobile data
 * must not, but it also should not need six requests to populate a dropdown.
 * So page size is client-settable here and only here, capped so no caller can
 * ask for an unbounded table — Skill grows at runtime via user-typed custom
 * skills.
 */
export const MAX_PAGE_SIZE = 100;

/** Cap on `?ids=` resolution — same reasoning as the page-size cap. */
export const MAX_IDS = 100;

export const CatalogQueryDto = z
  .object({
    // Case-insensitive substring match on `name`. Trimmed; absent or blank
    // means no filter. This is a SUPERSET of what the website does (its
    // pickers have no server-side search), never a change to it.
    q: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    /**
     * Resolve mode: a comma-separated id list, e.g. `?ids=3,17,42`.
     *
     * Exists because `GET /me/profile` returns bare `skillIds`,
     * `preferredCityIds` and `industryId` with no names, so the app cannot
     * render its own profile screen without turning those back into labels.
     * Without this the client would either fetch the whole catalogue or make
     * one request per id.
     *
     * When present, `q` and `page` are ignored — this is a lookup, not a
     * search, and silently paginating a resolve would drop ids the caller
     * asked about.
     */
    ids: z
      .string()
      .trim()
      .min(1)
      .transform((s, ctx) => {
        const parts = s.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length === 0 || parts.length > MAX_IDS) {
          ctx.addIssue({
            code: 'custom',
            message: `ids must contain between 1 and ${MAX_IDS} values`,
          });
          return z.NEVER;
        }
        const out: number[] = [];
        for (const p of parts) {
          const n = Number(p);
          // The int4 ceiling is load-bearing, not tidiness: these id columns
          // are Prisma `Int`, and a larger value makes findMany THROW rather
          // than return no rows — which escaped as a 500 from an
          // unauthenticated route, so one extra digit in a URL produced a 5xx
          // and a Sentry event. It also closes `?ids=1e10`, which
          // Number.isInteger accepts.
          if (!isInt32Id(n)) {
            ctx.addIssue({ code: 'custom', message: `ids must be positive integers: "${p}"` });
            return z.NEVER;
          }
          out.push(n);
        }
        // De-duplicated so a caller repeating an id cannot inflate the batch
        // past the cap or the row count past what they asked for.
        return [...new Set(out)];
      })
      .optional(),
  })
  .strict();

export type CatalogQuery = z.infer<typeof CatalogQueryDto>;
