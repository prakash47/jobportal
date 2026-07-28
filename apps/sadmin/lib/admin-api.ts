import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';

// Server-side reader for the AdminGuard'd endpoints in apps/api.
//
// Why this app has BOTH data paths: lib/dashboard/queries.ts reads Postgres
// directly because those are plain display-only counts with no server-side logic
// worth centralising. The review queue is different — the list and detail
// already exist as tested service methods (ordering rules, the resolved
// skill/city names, the company's KYC status), so re-implementing those queries
// here would fork logic that must agree with what the decision endpoint enforces.
// Every admin console page in the repo reads this way too, which is also the
// shape the /admin console migration will arrive in.
//
// Auth: the access_token cookie is HttpOnly, so it is forwarded explicitly as a
// request header. AdminGuard accepts cookie-or-Bearer and is origin-agnostic, so
// nothing on the API side needs to know this call came from the sadmin origin.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type AdminApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function adminApiGet<T>(path: string): Promise<AdminApiResult<T>> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  // The (authed) layout's requireSuperAdmin() already redirected anyone without
  // a valid admin session, so a missing cookie here means the session expired
  // between that check and this fetch. Reported as 401 so the caller can say so
  // rather than rendering a confusing empty state.
  if (!token) return { ok: false, status: 401, message: 'Your session has expired. Sign in again.' };

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
      cache: 'no-store',
    });
  } catch {
    // fetch only rejects on a transport failure — the API being down, or DNS.
    // Naming the URL turns "something went wrong" into an actionable message
    // during local development, matching what LoginForm does for the same case.
    return { ok: false, status: 0, message: `Could not reach the API at ${API_URL}.` };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof body?.message === 'string' ? body.message : `Request failed (${res.status})`;
    return { ok: false, status: res.status, message };
  }

  return { ok: true, data: (await res.json()) as T };
}
