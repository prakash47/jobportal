import { z } from 'zod';

// Query contract for GET /v1/jobs.
//
// The MAPPING from these params onto SearchJobsParams is not re-implemented
// here — `parseSrpSearchParams` from @jobportal/domain does it, exactly as the
// website's SRP does, so the two can never disagree about what `expMin=2` or
// `sort=recent` means. This DTO's only job is to reject input that the shared
// parser would otherwise silently coerce, and to accept the repeated-key form
// (?skill=react&skill=go) that Express produces as an array.
//
// Deliberately ABSENT: `status`. `searchJobs` DEFAULTS to ACTIVE rather than
// forcing it (searchJobs.ts:32 reads `status ?? 'ACTIVE'`), and the param is
// caller-overridable on the type. Accepting it here — or spreading the raw
// query into the search call — would let anyone request DRAFT documents
// straight out of the index. It is pinned server-side in the service instead.
//
// Also absent: `pageSize`. Fixed at 20 server-side, matching the SSR's
// PAGE_SIZE and /me/saved-jobs, so a caller cannot ask for 10,000 rows.

const oneOrMany = z.union([z.string(), z.array(z.string())]);

/** Server-fixed page size. Matches the SSR's PAGE_SIZE and /me/saved-jobs. */
export const PAGE_SIZE = 20;

/**
 * Elasticsearch's default `index.max_result_window`. `from + size` may not
 * exceed it, and we do not override the index setting.
 */
export const ES_MAX_RESULT_WINDOW = 10_000;

/** Last page the index can actually serve: 10000 / 20 = 500. */
export const MAX_PAGE = Math.floor(ES_MAX_RESULT_WINDOW / PAGE_SIZE);

export const ListJobsQueryDto = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    skill: oneOrMany.optional(),
    city: oneOrMany.optional(),
    industry: z.string().trim().min(1).optional(),
    // Years, not months — the shared parser multiplies by 12. Capped at a
    // sane career length so a huge value cannot produce a nonsense range.
    expMin: z.coerce.number().min(0).max(60).optional(),
    expMax: z.coerce.number().min(0).max(60).optional(),
    // Paise. Non-negative; the parser drops anything non-finite.
    salaryMin: z.coerce.number().min(0).optional(),
    postedWithin: z.enum(['1', '7', '30']).optional(),
    sort: z.enum(['relevance', 'recent', 'salary_desc']).optional(),
    // 1-indexed, bounded by what Elasticsearch can actually SERVE, not by a
    // guess. searchJobs computes `from = (page-1)*pageSize`, and ES rejects
    // `from + size > index.max_result_window` (default 10000) — so with a
    // fixed pageSize of 20 the last servable page is 500. The previous bound
    // of 1000 admitted 500 pages the index always refused, which surfaced as a
    // raw ES exception instead of this DTO's clean 400.
    //
    // Derived rather than hardcoded so it cannot drift if either constant
    // moves. Genuine pagination past 10k results would need search_after
    // instead of from/size; nothing needs that today.
    page: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
    // Accepted for URL parity with the website and then ignored, exactly as
    // the website ignores them. Documented as non-functional in the API
    // contract so the app does not render a filter that silently does nothing.
    emp: oneOrMany.optional(),
    mode: oneOrMany.optional(),
  })
  .strict();

export type ListJobsQuery = z.infer<typeof ListJobsQueryDto>;

// POST /v1/me/job-state — the bulk saved/applied lookup.
//
// A POST rather than a GET with a long query string: 20 ids per page would
// make a URL long enough to trip proxy limits, and this is a lookup, not a
// cacheable resource. Capped at 100 so one request cannot ask about the whole
// index.
export const JobStateQueryDto = z
  .object({
    jobIds: z.array(z.coerce.number().int().positive()).min(1).max(100),
  })
  .strict();

export type JobStateQuery = z.infer<typeof JobStateQueryDto>;
