import { z } from 'zod';
import { stripControlChars } from '../reports/dto';

// Admin decisions on user-submitted content reports (/sadmin/reports → Claim /
// Uphold / Dismiss). Zod + .strict(), matching admin-billing's dto.ts; there is
// no class-validator and no global ValidationPipe anywhere in this app.
//
// WRITES ONLY. The console reads Postgres directly in its RSCs (the repo's
// reads/writes split), so there is no list or detail DTO here — only the one
// PATCH body.

/**
 * The admin's own words about the decision, stored as
 * `ContentReport.resolutionNote`.
 *
 * Capped at 500 to match the reason on admin billing actions — deliberately
 * FAR shorter than the reporter's own 2000-char `details`, because this is a
 * staff annotation on a decision, not a description of the problem.
 *
 * ⚠ Control characters are stripped even though this field is ADMIN-authored,
 * and that is not paranoia about staff. Postgres cannot store U+0000 in a text
 * column and `String.prototype.trim()` does not treat it as whitespace, so a
 * NUL pasted in from a spreadsheet or a terminal buffer survives validation and
 * reaches the driver as a raw 500 — exactly the bug measured on the intake
 * endpoint. The same shared helper is reused rather than reimplemented, so the
 * two paths cannot drift on which code points count.
 *
 * Stripped BEFORE trimming, so a value that is nothing but control characters
 * collapses to '' and is then rejected by min(1) rather than being stored as an
 * empty string that reads like no note was ever demanded.
 */
const noteSchema = z
  .string()
  .transform(stripControlChars)
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(500));

/**
 * A discriminated union rather than one object with three optional fields: it
 * makes an impossible request — "dismiss this AND close the job" —
 * unrepresentable, and lets each branch demand exactly the fields it needs.
 * `.strict()` on each member rejects the leftover fields a client would send by
 * reusing one form for all three actions.
 */
export const UpdateReportDto = z.discriminatedUnion('action', [
  // Pick the report up: OPEN → REVIEWING. Reversible bookkeeping, not a
  // judgement, so it demands nothing and records nothing beyond the status.
  z
    .object({
      action: z.literal('CLAIM'),
    })
    .strict(),

  // Uphold the report: the content really is a problem.
  z
    .object({
      action: z.literal('ACTION'),
      // OPTIONAL here and REQUIRED on DISMISS below. That asymmetry is the
      // schema's own rule, not a preference: "Dismissing overrules a reporter,
      // so the note is required on that branch and is the thing worth
      // attributing" (ProfileAuditAction.CONTENT_REPORT_DISMISSED). Upholding
      // AGREES with the reporter, and the action taken is self-evident from the
      // accompanying JOB_CLOSED_BY_ADMIN row, so demanding prose there would be
      // ceremony that trains staff to type "ok".
      note: noteSchema.optional(),
      // Take the posting down: force-close a live job from ACTIVE to CLOSED.
      // Absent means "rule on the report only, leave the posting alone", which
      // is the right default — most upheld reports are about a posting that has
      // already expired or closed on its own.
      closeJob: z.boolean().optional(),
    })
    .strict(),

  // Reject the report: reviewed, and the content was found acceptable.
  z
    .object({
      action: z.literal('DISMISS'),
      note: noteSchema,
    })
    .strict(),
]);
export type UpdateReportInput = z.infer<typeof UpdateReportDto>;
