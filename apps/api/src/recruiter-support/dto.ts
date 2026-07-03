import { z } from 'zod';

// Recruiter Help & Support DTOs. Zod + .strict() (unknown keys → 400). The DTO
// is UX; the service re-checks the killswitch + ownership (the API is the trust
// boundary). Bounds keep a stray paste / abusive payload from reaching the DB.

const categorySchema = z.enum([
  'ACCOUNT',
  'JOB_POSTING',
  'APPLICANTS',
  'VERIFICATION',
  'BILLING',
  'TECHNICAL',
  'OTHER',
]);

// Raise a ticket: a subject + the initial problem statement + a triage category.
export const CreateTicketDto = z
  .object({
    subject: z.string().trim().min(4).max(150),
    description: z.string().trim().min(10).max(5000),
    category: categorySchema,
  })
  .strict();
export type CreateTicketInput = z.infer<typeof CreateTicketDto>;

// Reply on an existing ticket thread.
export const ReplyTicketDto = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export type ReplyTicketInput = z.infer<typeof ReplyTicketDto>;

// Contact Us: a one-off message. name/email are prefilled from the session but
// editable, so they are validated here rather than trusted from the JWT.
export const ContactMessageDto = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().toLowerCase(),
    subject: z.string().trim().min(4).max(150),
    message: z.string().trim().min(10).max(5000),
  })
  .strict();
export type ContactMessageInput = z.infer<typeof ContactMessageDto>;
