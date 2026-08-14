import { z } from 'zod';
import type { ContentReportReason, ContentReportTargetType } from '@jobportal/db';

// User-submitted content reports (SRS §4.16 — the moderation console's intake).
// Shapes mirror admin-jobs/dto.ts: `.strict()` everywhere, hand-rolled Zod, and
// the handler passes `unknown` so nothing reaches the service unvalidated.

// Both value sets are keyed by the Prisma enums rather than retyped as string
// literals, so adding a member to the schema without adding it here is a COMPILE
// error rather than a silently unreportable reason. Same guard the recruiter
// portal's EMPLOYMENT_LABEL adopted after it invented two enum values that did
// not exist and omitted one that did.
const TARGET_TYPES: Record<ContentReportTargetType, true> = {
  JOB: true,
};
const REASONS: Record<ContentReportReason, true> = {
  FAKE_OR_SCAM: true,
  MISLEADING: true,
  DISCRIMINATORY: true,
  OFFENSIVE: true,
  DUPLICATE: true,
  OTHER: true,
};

// `Object.keys` widens to string[], and z.enum needs a non-empty literal tuple.
// The Records above are what make the cast safe — they cannot be missing a
// member without failing to typecheck.
export const REPORT_TARGET_TYPES = Object.keys(TARGET_TYPES) as [
  ContentReportTargetType,
  ...ContentReportTargetType[],
];
export const REPORT_REASONS = Object.keys(REASONS) as [
  ContentReportReason,
  ...ContentReportReason[],
];

// The largest value a Postgres `integer` column holds. `jobId` is checked here
// rather than left to Prisma: an out-of-range number reaches the driver as a
// numeric overflow and surfaces as a 500, which is the exact class of bug the
// /sadmin/job-postings review found on an id route. A too-large id is a client
// error, so it must fail validation and answer 400.
const INT4_MAX = 2_147_483_647;

export const CreateReportDto = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    // Nullable-in-schema, required-here: with JOB as the only target type there
    // is always exactly one FK to set. The `.refine` below is what keeps this
    // honest when a second target type is added — the field becomes optional in
    // the object and the refinement starts carrying the invariant.
    jobId: z.number().int().positive().max(INT4_MAX).optional(),
    reason: z.enum(REPORT_REASONS),
    // The reporter's own words. Optional — the structured `reason` is the axis
    // the queue works from, and demanding prose suppresses reports.
    //
    // Trimmed BEFORE the length check so 2000 spaces is not a valid report, and
    // an empty result becomes undefined rather than an empty string, so the
    // column holds NULL instead of '' and the console's "no detail given" branch
    // is reached by one value rather than two.
    details: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(2000))
      .transform((s) => (s.length > 0 ? s : undefined))
      .optional(),
  })
  .strict()
  .refine((d) => d.targetType !== 'JOB' || d.jobId != null, {
    message: 'jobId is required when targetType is JOB',
    path: ['jobId'],
  });

export type CreateReportInput = z.infer<typeof CreateReportDto>;
