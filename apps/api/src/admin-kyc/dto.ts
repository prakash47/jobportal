import { z } from 'zod';

// Admin KYC review queue filters + the approve/reject decision payload.

export const KYC_REVIEW_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'NOT_SUBMITTED'] as const;

export const ListKycQueryDto = z
  .object({
    status: z.enum(KYC_REVIEW_STATUSES).optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((n) => n >= 1, 'page must be ≥ 1')
      .optional(),
  })
  .strict();
export type ListKycQueryInput = z.infer<typeof ListKycQueryDto>;

export const ReviewKycDto = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    // Required (and non-empty) when rejecting so the recruiter gets an actionable
    // reason; ignored on approve.
    reason: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((d) => d.decision !== 'REJECT' || (d.reason != null && d.reason.trim().length > 0), {
    message: 'A reason is required when rejecting',
    path: ['reason'],
  });
export type ReviewKycInput = z.infer<typeof ReviewKycDto>;
