// Shared bits of the Roles & Permissions console's mutation islands. Kept out of
// the component files so the error copy has ONE definition: the invite form, the
// permission editor, the deactivate control and the invite row all answer the
// same API, and four different sentences for the same 503 is how staff learn to
// distrust the messages.

// `credentials: 'include'` is required on every call — the access_token cookie is
// HttpOnly and apps/api is a different origin.
//
// ⚠ NEXT_PUBLIC_API_URL is NOT set in apps/sadmin/.env (only in .env.example), so
// this falls through to localhost in local development exactly as every other
// island in this portal does. A pre-existing portal-wide gap, not worked around
// here.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * A native form control styled to match the design system's SelectTrigger.
 *
 * Re-exported rather than redefined — there is exactly one definition of this
 * string in the portal and a second copy would drift.
 */
export { FIELD_CLASS } from '../subscriptions/shared';

export type StaffAction =
  | 'invite'
  | 'resend'
  | 'revoke'
  | 'update'
  | 'deactivate'
  | 'reactivate'
  | 'accept';

/**
 * Turns a failed /admin/staff response into a sentence staff can act on.
 *
 * The 409 is the one worth getting right here, because this API refuses for four
 * genuinely different reasons that all arrive as a conflict — the address is
 * already staff, it belongs to a candidate or recruiter, the target is the last
 * super admin, or the actor is trying to change their own access. Every one of
 * those is a permanent property of the request rather than something a retry
 * fixes, and the API's own sentences are written for staff, so surfacing them
 * beats anything generic invented here.
 *
 * Zod issues arrive as an ARRAY in `message` (controllers throw
 * `BadRequestException(parsed.error.issues)`), so that shape is handled
 * explicitly — otherwise a validation failure renders "[object Object]".
 */
export async function describeApiError(res: Response, action: StaffAction): Promise<string> {
  if (res.status === 401) return 'Your session has expired. Sign in again.';
  if (res.status === 403) {
    return 'You no longer have permission to manage staff access.';
  }
  if (res.status === 503) {
    // Two different killswitches reach this status, and the remedies differ, so
    // the copy names the action rather than the switch: an admin who cannot
    // invite because mail is down CAN still change an existing person's role.
    return action === 'invite' || action === 'resend'
      ? 'Invitations are temporarily unavailable — staff provisioning or outbound email is switched off. Existing access can still be changed.'
      : 'Staff changes are currently switched off.';
  }
  if (res.status === 404) {
    return action === 'resend' || action === 'revoke'
      ? 'That invitation no longer exists.'
      : 'That staff account no longer exists.';
  }
  if (res.status === 429) {
    return 'Too many attempts in a short time. Wait a minute and try again.';
  }

  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const message = body?.message;

  if (typeof message === 'string') return message;

  // Zod's issue array. The first issue is the actionable one; listing all of
  // them produces a wall of text for what is usually one bad field.
  if (Array.isArray(message)) {
    const first = message[0] as { message?: unknown } | undefined;
    if (typeof first?.message === 'string') return first.message;
  }

  return `Request failed (${res.status}).`;
}
