import { z } from 'zod';

// Admin job-moderation queue filters + the approve/reject decision payload.
// Shapes mirror admin-kyc/dto.ts: `.strict()` everywhere, and query params are
// strings (Express) transformed to numbers rather than coerced.

// Two VIEWS, not a raw status filter.
//
// Filtering on JobStatus was the obvious design and it is wrong: `ACTIVE` is
// every live job on the platform, the overwhelming majority of which were never
// moderated, and `DRAFT` is every unfinished draft. A console offering those as
// "approved" and "sent back" tabs would be stating something false — the review
// console must only ever show jobs that actually went through review.
//
//   pending — awaiting a decision now (the queue).
//   decided — has a reviewedAt, i.e. a human actually ruled on it. This is also
//     the only place a moderation decision is readable at all: decisions write
//     ProfileAuditLog rows, and that table has no read surface anywhere.
export const JOB_REVIEW_VIEWS = ['pending', 'decided'] as const;
export type JobReviewView = (typeof JOB_REVIEW_VIEWS)[number];

export const ListAdminJobsQueryDto = z
  .object({
    view: z.enum(JOB_REVIEW_VIEWS).optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((n) => n >= 1, 'page must be ≥ 1')
      .optional(),
  })
  .strict();
export type ListAdminJobsQueryInput = z.infer<typeof ListAdminJobsQueryDto>;

export const ModerateJobDto = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    // Required (and non-empty) when rejecting so the recruiter gets something
    // actionable — the reason is written to Job.rejectionReason and shown to
    // them verbatim. Ignored on approve, where the service forces it to null.
    reason: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((d) => d.decision !== 'REJECT' || (d.reason != null && d.reason.trim().length > 0), {
    message: 'A reason is required when rejecting',
    path: ['reason'],
  });
export type ModerateJobInput = z.infer<typeof ModerateJobDto>;
