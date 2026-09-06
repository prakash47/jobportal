'use client';

// Authenticated fetch for browser-side calls to the API.
//
// THE BUG THIS EXISTS TO FIX
// --------------------------
// The access cookie has a 15-minute Max-Age (packages/auth cookies.ts,
// ACCESS_TTL_MS). After that the browser stops sending it and every API call
// returns 401 "No access token". A 30-day refresh cookie is issued alongside it
// and `POST /auth/refresh` has always existed and always worked — but NOTHING in
// this app ever called it. The API's own comment acknowledged as much: "the
// refresh cookie (path=/auth) stays reachable if refresh is ever wired up".
//
// The practical effect was that a signed-in seeker had roughly fifteen minutes
// before every action failed. It surfaced as "No access token" on the Apply
// button, but it was never an Apply bug — leave any authed page open long
// enough and the next click, anywhere, would fail the same way.
//
// Verified against the running API: dropping only the access cookie gives 401;
// POST /auth/refresh with just the refresh cookie returns 200 and re-issues it;
// the retried call then returns 200.
//
// WHY THE SINGLE-FLIGHT PROMISE IS NOT OPTIONAL
// ---------------------------------------------
// Refresh tokens are ROTATED on every use (CLAUDE.md §9). If two requests 401 at
// once — which is the normal case on a page that fires several calls — and each
// refreshed independently, the second would present a token the first had just
// rotated away, and the user would be logged out by the very mechanism meant to
// keep them signed in. All callers therefore await one shared refresh.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The in-flight refresh, shared by every caller that 401s at the same moment. */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      // Network failure is not "logged out" — report failure and let the
      // caller surface the original error rather than a misleading one.
      return false;
    } finally {
      // Cleared in `finally` so a failed refresh does not poison every later
      // attempt with a permanently-rejected cached promise.
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * `fetch` for authenticated API calls: sends cookies, and on a 401 refreshes
 * the session once and retries.
 *
 * Deliberately NOT for the auth endpoints themselves. `/auth/login` answers a
 * wrong password with 401, and retrying that would turn one failed sign-in into
 * two — so LoginForm, RegisterForm and the sign-out path keep using plain
 * `fetch`.
 *
 * Returns the ORIGINAL 401 response when the refresh fails, so callers see the
 * real reason rather than a synthesised one.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const options: RequestInit = { ...init, credentials: 'include' };

  const res = await fetch(url, options);
  if (res.status !== 401) return res;

  const refreshed = await refreshSession();
  if (!refreshed) return res;

  // Exactly one retry. A second 401 means the session is genuinely gone, and
  // looping would spin rather than tell the user anything.
  return fetch(url, options);
}

/** Base URL for callers that still need to build their own request. */
export { API_URL };
