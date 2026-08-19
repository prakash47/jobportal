// Shared bits of the Broadcast console's mutation islands. Kept out of the
// component files so the error copy has ONE definition: the composer, the test
// send, the dispatch dialog and the cancel button all answer the same API, and
// four different sentences for the same 503 is how staff learn to distrust the
// messages.

// `credentials: 'include'` is required on every call below — the access_token
// cookie is HttpOnly and apps/api is a different origin.
//
// ⚠ NEXT_PUBLIC_API_URL is NOT set in apps/sadmin/.env (only in .env.example),
// so this falls through to localhost in local development exactly as every other
// island in this portal does. Recorded as a pre-existing portal-wide gap rather
// than worked around here.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * A native form control styled to match the design system's SelectTrigger.
 *
 * Re-exported rather than redefined: two copies of this class string would drift
 * and the composer's selects would stop matching the rest of the portal.
 */
export { FIELD_CLASS } from '../subscriptions/shared';

/**
 * Turns a failed /admin/broadcasts response into a sentence staff can act on.
 *
 * The 400 is the one worth getting right here, and it is why this does not just
 * surface `Request failed (400)`. The API refuses a send for four DIFFERENT
 * reasons — promotional category, no test send, an empty segment, a malformed
 * body — and each has a specific remedy the admin can carry out immediately.
 * Its own sentences are written for staff, so they are better than anything
 * generic this could invent.
 *
 * Zod issues arrive as an ARRAY in `message` rather than a string (the
 * controllers throw `BadRequestException(parsed.error.issues)`), so that shape
 * is handled explicitly — otherwise a validation failure renders "[object
 * Object]" and tells the admin nothing at all.
 */
export async function describeApiError(res: Response, action: 'save' | 'test' | 'send' | 'cancel'): Promise<string> {
  if (res.status === 401) return 'Your session has expired. Sign in again.';
  if (res.status === 503) {
    return action === 'send'
      ? 'Sending broadcasts is currently switched off. A broadcast can still be composed and tested.'
      : 'That action is temporarily unavailable.';
  }
  if (res.status === 404) return 'This broadcast no longer exists.';
  if (res.status === 429) {
    return 'Too many attempts in a short time. Wait a minute and try again.';
  }

  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const message = body?.message;

  if (typeof message === 'string') return message;

  // Zod's issue array. The first issue's message is the actionable one; listing
  // all of them produces a wall of text for what is usually one bad field.
  if (Array.isArray(message)) {
    const first = message[0] as { message?: unknown } | undefined;
    if (typeof first?.message === 'string') return first.message;
  }

  return `Request failed (${res.status}).`;
}
