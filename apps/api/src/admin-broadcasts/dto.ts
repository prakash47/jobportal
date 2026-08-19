import { z } from 'zod';
import { segmentSupportsInApp } from './broadcast-segment';

// Admin Broadcast Notifications: queue filters + the compose/dispatch payloads.
// Zod only — apps/api has no global ValidationPipe and no class-validator, so a
// handler that takes a typed @Body() is completely unvalidated at runtime. Every
// handler here takes `unknown` and calls `safeParse`.

export const BROADCAST_STATUSES = ['DRAFT', 'SENDING', 'SENT', 'CANCELLED', 'FAILED'] as const;
export const BROADCAST_SEGMENTS = ['ALL_CANDIDATES', 'ALL_RECRUITERS', 'ALL_USERS'] as const;
export const BROADCAST_CATEGORIES = ['OPERATIONAL', 'PROMOTIONAL'] as const;

/** Mirrors the ceilings the console's own fields enforce. */
export const SUBJECT_MAX = 150;
export const BODY_MAX = 10_000;
export const CTA_LABEL_MAX = 40;
export const CTA_URL_MAX = 500;

const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((n) => n >= 1, 'page must be ≥ 1')
  .optional();

/**
 * Free-text search over the broadcast subject.
 *
 * `.transform`, never `.refine` — a `.refine` that calls a trimming helper
 * validates the trimmed value but hands the RAW one downstream, which is how a
 * whitespace-padded date reached three guards at once on the transactions
 * console. Here the transform is the only thing that runs.
 */
const querySchema = z
  .string()
  .max(500, 'q is too long')
  .transform((raw) => {
    const collapsed = raw.trim().replace(/\s+/g, ' ');
    return collapsed === '' ? undefined : collapsed.slice(0, 100);
  })
  .optional();

export const ListBroadcastsQueryDto = z
  .object({
    status: z.enum(BROADCAST_STATUSES).optional(),
    q: querySchema,
    page: pageSchema,
  })
  .strict();
export type ListBroadcastsQueryInput = z.infer<typeof ListBroadcastsQueryDto>;

export const PreviewCountDto = z
  .object({
    segment: z.enum(BROADCAST_SEGMENTS),
  })
  .strict();
export type PreviewCountInput = z.infer<typeof PreviewCountDto>;

/**
 * The CTA URL.
 *
 * Absolute `https://` only, and that is a real constraint rather than
 * conservatism: ONE column cannot be correct in both places this message is
 * rendered. An email needs an absolute URL because it opens outside any of our
 * apps, while `Notification.linkUrl` is a RECRUITER-PORTAL-RELATIVE path
 * (`/jobs/123/applicants`, `/support/tickets/9`) that the bell hands straight to
 * `router.push` inside apps/recruiter. A value that satisfies one is broken in
 * the other, and a broadcast is the worst possible place to discover a broken
 * link.
 *
 * So the CTA is EMAIL-ONLY in v1: in-app rows carry `linkUrl: null` and the bell
 * renders title + body. Giving the in-app copy its own link needs a second
 * column and a decision about which portal it addresses — recorded as a
 * follow-up rather than guessed at here.
 *
 * `http://` is rejected as well as malformed input. A platform-wide email is not
 * where we send thousands of people to an unencrypted page.
 */
const ctaUrlSchema = z
  .string()
  .trim()
  .max(CTA_URL_MAX)
  .refine((v) => {
    let parsed: URL;
    try {
      parsed = new URL(v);
    } catch {
      return false;
    }
    return parsed.protocol === 'https:';
  }, 'ctaUrl must be an absolute https:// URL');

const contentShape = {
  subject: z.string().trim().min(1).max(SUBJECT_MAX),
  /**
   * PLAIN TEXT. Rendered through the shared email layout's `esc()` and split
   * into paragraphs on blank lines.
   *
   * `renderLayout` treats `bodyParagraphs` as already-escaped RAW HTML (its own
   * comment says so), so accepting markup here would let an admin inject
   * arbitrary HTML into an email addressed to the entire platform. Escaping
   * happens at render, but the contract starts here.
   */
  body: z.string().trim().min(1).max(BODY_MAX),
  category: z.enum(BROADCAST_CATEGORIES),
  segment: z.enum(BROADCAST_SEGMENTS),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  ctaLabel: z.string().trim().min(1).max(CTA_LABEL_MAX).optional(),
  ctaUrl: ctaUrlSchema.optional(),
};

/**
 * Cross-field rules shared by create and update.
 *
 * All three are cases where the request would otherwise be accepted and then do
 * something other than what it said:
 *
 *  - **No channel at all** would produce a broadcast that "sends" to nobody and
 *    reports success.
 *  - **A half-configured CTA** renders either a button with no destination or a
 *    destination with no button — the email layout takes `{label, url}` as a
 *    pair, so one without the other is silently dropped.
 *  - **In-app to a candidate-only segment** resolves to an empty audience,
 *    because apps/web has no notification surface to render a row on. Accepting
 *    it would tell the admin their in-app announcement went out when nothing was
 *    written and nothing could have been displayed.
 */
export const CreateBroadcastDto = z
  .object(contentShape)
  .strict()
  .superRefine((v, ctx) => {
    if (!v.emailEnabled && !v.inAppEnabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['emailEnabled'],
        message: 'Choose at least one channel — email, in-app, or both.',
      });
    }

    const hasLabel = v.ctaLabel !== undefined;
    const hasUrl = v.ctaUrl !== undefined;
    if (hasLabel !== hasUrl) {
      ctx.addIssue({
        code: 'custom',
        path: [hasLabel ? 'ctaUrl' : 'ctaLabel'],
        message: 'A button needs both a label and a link, or neither.',
      });
    }

    if (v.inAppEnabled && !segmentSupportsInApp(v.segment)) {
      ctx.addIssue({
        code: 'custom',
        path: ['inAppEnabled'],
        message:
          'In-app notifications reach recruiters only — the job-seeker site has no notification surface. Choose email for a candidate broadcast.',
      });
    }
  });
export type CreateBroadcastInput = z.infer<typeof CreateBroadcastDto>;

/**
 * Editing a draft replaces the whole content, rather than patching fields.
 *
 * A PATCH shape would let a broadcast's subject change while `testSentAt` still
 * attested to an earlier draft that a human actually read. Requiring the full
 * body makes "the content changed" trivially detectable, which is what lets the
 * service clear `testSentAt` and force a fresh test send.
 */
export const UpdateBroadcastDto = CreateBroadcastDto;
export type UpdateBroadcastInput = CreateBroadcastInput;
