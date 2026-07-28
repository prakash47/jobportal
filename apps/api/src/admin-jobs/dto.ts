import { z } from 'zod';

// Admin job-moderation queue filters + the approve/reject decision payload.
// Shapes mirror admin-kyc/dto.ts: `.strict()` everywhere, and query params are
// strings (Express) transformed to numbers rather than coerced.

// The queue's own state plus the two states a decision can produce, so the UI
// can offer "waiting / approved / sent back" views over the same endpoint.
// Deliberately NOT the full JobStatus set — EXPIRED and CLOSED are lifecycle
// outcomes, not moderation ones, and listing them here would imply this console
// is a general job browser.
export const JOB_REVIEW_STATUSES = ['PENDING_MODERATION', 'ACTIVE', 'DRAFT'] as const;

export const ListAdminJobsQueryDto = z
  .object({
    status: z.enum(JOB_REVIEW_STATUSES).optional(),
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
