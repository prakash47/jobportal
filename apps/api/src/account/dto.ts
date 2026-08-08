import { z } from 'zod';

/**
 * The exact phrase a caller must send to delete their account.
 *
 * Not a password re-prompt: this endpoint is already behind `JwtAuthGuard`, and
 * a native client that holds a valid access token has no password to re-ask for
 * without storing one — which is precisely what mobile token transport exists to
 * avoid (ADR 0002 decision 1).
 *
 * It is here so that deletion cannot happen by accident. A bare `DELETE
 * /v1/me/account` is one mistyped fetch or one over-eager retry away from being
 * irreversible, and unlike every other destructive action in this codebase there
 * is nothing to restore afterwards. Requiring a literal, typed phrase means the
 * request can only be constructed on purpose.
 *
 * Uppercase and exact — the UI shows the word to type, so accepting variants
 * would only widen what an accidental request can look like.
 */
export const DELETE_CONFIRMATION = 'DELETE';

export const DeleteAccountDto = z
  .object({
    confirm: z.literal(DELETE_CONFIRMATION),
  })
  .strict();

export type DeleteAccountInput = z.infer<typeof DeleteAccountDto>;
