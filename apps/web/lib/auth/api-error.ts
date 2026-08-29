// Pull a human-readable string out of an API error body. The API returns
// either a plain `{ message: string }` (most errors) OR, for Zod validation
// failures, `{ message: ZodIssue[] }` (NestJS serializes the issues array). The
// naive `new Error(body.message)` stringifies that array to "[object Object]" —
// this extracts the issues' own `.message` fields instead so forms show the
// real validation text (e.g. the password requirement).
export function apiErrorMessage(body: unknown, fallback: string): string {
  const fromIssues = (arr: unknown[]): string | null => {
    const msgs = arr
      .map((issue) => {
        if (issue && typeof issue === 'object' && 'message' in issue) {
          return String((issue as { message: unknown }).message);
        }
        return typeof issue === 'string' ? issue : null;
      })
      .filter((x): x is string => Boolean(x));
    return msgs.length ? msgs.join('. ') : null;
  };

  if (Array.isArray(body)) return fromIssues(body) ?? fallback;

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return fromIssues(message) ?? fallback;
  }

  return fallback;
}

/**
 * An API failure that still carries its parsed body.
 *
 * `apiErrorMessage` reduces a response to display text, which is all most call
 * sites need — but some error bodies carry data the UI has to act on, not just
 * show. The signup cooldown 429 is the case that forced this: it returns the
 * seconds remaining, and throwing away everything but the message left the
 * Resend button with no way to re-arm itself, so it stayed enabled and every
 * press failed again.
 *
 * Append-only addition: `apiErrorMessage` is untouched and every existing
 * caller keeps working, since this is still an Error with the same message.
 */
export class ApiError extends Error {
  readonly body: Record<string, unknown>;

  constructor(message: string, body: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.body = body;
  }
}
