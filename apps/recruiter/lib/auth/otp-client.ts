// Browser client for the two unauthenticated signup-OTP endpoints
// (POST /auth/recruiter/otp/request and /verify).
//
// Deliberately NOT built on lib/api-client.ts: that wrapper reduces a failure to
// `{ status, message }` and discards the rest of the body, but the request
// endpoint's 429 carries `resendAvailableAt` — the only reliable source for how
// long the resend button has to stay counting down. Widening `api()` would touch
// a helper every authed surface in this app depends on, so the signup flow keeps
// its own small client instead.
//
// No `credentials: 'include'`: these endpoints run before the recruiter has an
// account, let alone a session cookie, so there is nothing to send.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type OtpChannel = 'EMAIL' | 'PHONE';

export interface OtpRequestAccepted {
  /** Minted by the server on the first request; echoed back on every later one. */
  signupId: string;
  /** ISO-8601 — when the issued code stops being accepted (15 minutes). */
  expiresAt: string;
  /** ISO-8601 — when a resend will be accepted again (30-second cooldown). */
  resendAvailableAt: string;
}

export interface OtpVerified {
  verified: boolean;
}

export interface OtpFailure {
  /** Already human-readable: the API writes these strings for the recruiter. */
  message: string;
  /** Present on a 429 from the request endpoint; null everywhere else. */
  resendAvailableAt: string | null;
}

export type OtpResult<T> = { ok: true; data: T } | { ok: false; error: OtpFailure };

const NETWORK_FAILURE: OtpFailure = {
  message: 'Network error — please check your connection and try again.',
  resendAvailableAt: null,
};

/**
 * Pull a string off an unknown JSON body. Nest's exception filter puts a string
 * in `message` for the errors a recruiter can actually hit, but a DTO rejection
 * arrives as a string ARRAY — coerced here so an array can never be rendered
 * into the DOM as "[object Object]".
 */
function readMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const value = (body as Record<string, unknown>)['message'];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return fallback;
}

function readTimestamp(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

async function post<T>(path: string, payload: unknown, fallback: string): Promise<OtpResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: NETWORK_FAILURE };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        message: readMessage(body, fallback),
        resendAvailableAt: readTimestamp(body, 'resendAvailableAt'),
      },
    };
  }
  return { ok: true, data: body as T };
}

export interface RequestOtpInput {
  /** Null before the first request of a signup attempt — the server mints one. */
  signupId: string | null;
  channel: OtpChannel;
  /** Lower-cased email, or the E.164 mobile. Stored verbatim on the challenge. */
  destination: string;
  /** The registrant's typed name; the API requires 1..120 characters. */
  name: string;
}

export function requestOtp(input: RequestOtpInput): Promise<OtpResult<OtpRequestAccepted>> {
  const { signupId, ...rest } = input;
  // `signupId` is optional in the DTO, and an optional Zod string rejects an
  // explicit null — so the key is omitted entirely rather than sent as null.
  const payload = signupId === null ? rest : { signupId, ...rest };
  return post<OtpRequestAccepted>(
    '/auth/recruiter/otp/request',
    payload,
    'Could not send the code. Please try again.',
  );
}

export interface VerifyOtpInput {
  signupId: string;
  channel: OtpChannel;
  /** Exactly six digits. */
  code: string;
}

export function verifyOtp(input: VerifyOtpInput): Promise<OtpResult<OtpVerified>> {
  return post<OtpVerified>(
    '/auth/recruiter/otp/verify',
    input,
    'Could not check that code. Please try again.',
  );
}
