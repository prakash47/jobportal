import { z } from 'zod';

// Admin support console: queue filters + the staff mutation payloads.

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((n) => n >= 1, 'page must be ≥ 1')
  .optional();

/**
 * Free-text search over ticket subject + company name.
 *
 * `.transform`, never `.refine` — a `.refine` that calls a trimming helper
 * validates the trimmed value but hands the RAW one downstream, which is exactly
 * how a whitespace-padded date reached three guards at once on the transactions
 * console. Here the transform is the only thing that runs, so what the service
 * receives is what was validated.
 *
 * An all-whitespace `?q=` collapses to undefined rather than an empty string, so
 * `/tickets?q=` and `/tickets` are the same query rather than two states that
 * could drift. Capped at 100 characters to match the console's own
 * `normalizeQuery`; a longer needle cannot match anything useful and is only a
 * way to make Postgres scan.
 */
const querySchema = z
  .string()
  .max(500, 'q is too long')
  .transform((raw) => {
    const collapsed = raw.trim().replace(/\s+/g, ' ');
    return collapsed === '' ? undefined : collapsed.slice(0, 100);
  })
  .optional();

export const ListTicketsQueryDto = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    q: querySchema,
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

/**
 * An internal note — staff-only text, never shown to the raiser.
 *
 * Same shape as StaffReplyDto and deliberately so: a note is the same kind of
 * free text with the same length ceiling, and giving the private one a LOOSER
 * limit than the public one would be an odd thing to have to explain. They are
 * separate schemas rather than one shared alias because they land in different
 * tables with different audiences, and a future change to one (a note gaining a
 * category, say) must not silently apply to the other.
 */
export const AddNoteDto = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export type AddNoteInput = z.infer<typeof AddNoteDto>;
