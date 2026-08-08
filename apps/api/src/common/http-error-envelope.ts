import { HttpStatus } from '@nestjs/common';

// ADR 0002 decision 2 — the documented error envelope.
//
// Every error this API returns has these three keys at the top level:
//
//   { "statusCode": 400, "error": "Bad Request", "message": <string | string[] | issue[]> }
//
// This is Nest's own shape, deliberately: `HttpException.createBody()` already
// wraps both a thrown string and a thrown array into exactly this, so the ~121
// Zod `throw new BadRequestException(parsed.error.issues)` call sites and the
// plain-string throws were ALREADY consistent. Codifying Nest's shape rather
// than inventing one keeps every existing web caller working untouched.
//
// Exactly one path was off-contract: a thrown HttpException whose body is a
// plain OBJECT is returned verbatim, with no statusCode/error at all (the
// apply-quota 429 in applications/quota.service.ts). `withEnvelope` fixes that
// class of body ADDITIVELY — the object's own keys are preserved, so
// apps/web's ApplyButton, which reads `upgradeAvailable` and `message` off the
// top level, keeps working byte-for-byte.
//
// Deliberately NOT done: rewriting `message` into a single canonical string.
// The Zod-issue array is what the three web apps parse for field-level errors,
// and flattening it would break form validation everywhere to satisfy a
// cosmetic preference.

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: unknown;
  [key: string]: unknown;
}

/** Human-readable name for a status code, matching Nest's `error` field. */
export function reasonPhrase(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') return 'Error';
  // HttpStatus keys are SCREAMING_SNAKE_CASE — 'TOO_MANY_REQUESTS' → 'Too Many Requests'
  return name
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Add the envelope keys to an exception body without disturbing what is
 * already there.
 *
 * - string body            → `{ statusCode, error, message: <string> }`
 * - array body (Zod issues)→ `{ statusCode, error, message: [...] }`
 * - object body            → the object's own keys, PLUS any envelope key it
 *                            is missing. Existing keys always win, so a body
 *                            that already carries `message` keeps its own.
 */
export function withEnvelope(body: unknown, status: number): ErrorEnvelope {
  const error = reasonPhrase(status);

  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const own = body as Record<string, unknown>;
    return {
      ...own,
      statusCode: typeof own.statusCode === 'number' ? own.statusCode : status,
      error: typeof own.error === 'string' ? own.error : error,
      message: 'message' in own ? own.message : error,
    };
  }

  return { statusCode: status, error, message: body ?? error };
}

/**
 * Seconds a client should wait before retrying, for the two 429 paths.
 *
 * A mobile client cannot back off correctly without this — and unlike a
 * browser tab, a phone that retries blindly will burn the user's battery and
 * trip the limiter again. Returns null when the status is not a 429.
 *
 * `resetSeconds` comes from the throttler when available; the apply-quota
 * limit is a *daily* budget, so it falls back to the seconds remaining until
 * the next UTC midnight rather than a fixed guess.
 */
export function retryAfterSeconds(
  status: number,
  body: unknown,
  now: Date = new Date(),
): number | null {
  if (status !== HttpStatus.TOO_MANY_REQUESTS) return null;

  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const own = body as Record<string, unknown>;
    // The apply-quota body is the daily-budget one; it carries `limit`.
    if (typeof own.limit === 'number') {
      const nextMidnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      );
      return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
    }
  }

  // ThrottlerGuard's window is 60s across every @Throttle in this app
  // (auth.module.ts default plus the per-route overrides), so a fresh window
  // is at most a minute away.
  return 60;
}
