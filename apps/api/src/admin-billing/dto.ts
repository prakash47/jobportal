import { z } from 'zod';

// Admin subscription management (/sadmin/subscriptions → Comp / Change plan /
// Extend / Cancel). Zod + .strict(), matching admin-support's dto.ts; there is
// no class-validator anywhere in this app.

// Every action here hands out, reshapes or revokes a paid plan for free, so a
// staff-authored reason is REQUIRED on all four rather than optional. It is the
// only part of the audit row a future reader cannot reconstruct from the data:
// the plan, the period and the actor are all recoverable, but "why" is not.
//
// Capped at 500 to match the resolution note on content reports. Trimmed before
// the min check, so a whitespace-only reason is rejected rather than stored as
// an empty string that reads like no reason was demanded.
const reasonSchema = z.string().trim().min(1).max(500);

// Ids arrive as JSON numbers (these are POST/PATCH bodies, not query strings),
// so they are validated as ints directly rather than through the string→Number
// transform the list DTOs use. int() rejects 1.5; positive() rejects 0 and -1.
// The int4 ceiling is enforced too: a larger value makes Prisma THROW rather
// than match nothing, which is the bug class that produced 500s on
// /v1/jobs/:slug and /sadmin/job-postings before it was fixed in @jobportal/domain.
const idSchema = z.number().int().positive().max(2_147_483_647);

export const GrantSubscriptionDto = z
  .object({
    companyId: idSchema,
    planId: idSchema,
    reason: reasonSchema,
  })
  .strict();
export type GrantSubscriptionInput = z.infer<typeof GrantSubscriptionDto>;

// Upper bound on a single extension. Two years is longer than the longest plan
// on the platform (enterprise-yearly, 365 days) and short enough that a slipped
// digit cannot comp a decade. Staff can always extend twice; nobody can extend
// once by accident and not notice.
const MAX_EXTEND_DAYS = 730;

// A discriminated union rather than one object with three optional fields: it
// makes an impossible request — "extend by 30 days AND change the plan" —
// unrepresentable, and it means each branch can demand exactly the fields it
// needs. .strict() on each member rejects the leftover fields a client would
// send by reusing one form for all three actions.
export const UpdateSubscriptionDto = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('CHANGE_PLAN'),
      planId: idSchema,
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('EXTEND'),
      days: z.number().int().positive().max(MAX_EXTEND_DAYS),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('CANCEL'),
      reason: reasonSchema,
    })
    .strict(),
]);
export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionDto>;
