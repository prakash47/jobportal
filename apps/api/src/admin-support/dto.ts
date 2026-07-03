import { z } from 'zod';

// Admin support console: queue filters + the staff mutation payloads.

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((n) => n >= 1, 'page must be ≥ 1')
  .optional();

export const ListTicketsQueryDto = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    page: pageSchema,
  })
  .strict();
export type ListTicketsQueryInput = z.infer<typeof ListTicketsQueryDto>;

export const ListContactMessagesQueryDto = z
  .object({
    page: pageSchema,
  })
  .strict();
export type ListContactMessagesQueryInput = z.infer<typeof ListContactMessagesQueryDto>;

export const UpdateTicketStatusDto = z
  .object({
    status: z.enum(TICKET_STATUSES),
  })
  .strict();
export type UpdateTicketStatusInput = z.infer<typeof UpdateTicketStatusDto>;

export const StaffReplyDto = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export type StaffReplyInput = z.infer<typeof StaffReplyDto>;
