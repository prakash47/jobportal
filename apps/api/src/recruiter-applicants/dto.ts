import { z } from 'zod';

export const TransitionApplicationDto = z
  .object({
    // Recruiter-driven status. State machine validates the transition;
    // WITHDRAWN is intentionally excluded — that's candidate-only.
    status: z.enum([
      'IN_REVIEW',
      'SHORTLISTED',
      'INTERVIEWED',
      'OFFERED',
      'HIRED',
      'REJECTED',
    ]),
  })
  .strict();
export type TransitionApplicationInput = z.infer<typeof TransitionApplicationDto>;

export const SetApplicantNotesDto = z
  .object({
    // Empty string clears the notes; null is rejected so the field is always
    // a string at the DB layer.
    notes: z.string().max(5_000),
  })
  .strict();
export type SetApplicantNotesInput = z.infer<typeof SetApplicantNotesDto>;

export const ListApplicantsQueryDto = z
  .object({
    sort: z.enum(['date', 'status']).optional(),
    page: z.coerce.number().int().min(1).optional(),
  })
  .strict();
export type ListApplicantsQuery = z.infer<typeof ListApplicantsQueryDto>;
