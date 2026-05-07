// Server-side fetch helper for the apply quota state. Forwards the access
// cookie to the API's /me/applications/quota endpoint so the JD page can pre-
// derive Layer 2 (UI hint) state without re-implementing the flag + Redis
// logic on the web side.

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface QuotaState {
  count: number;
  limit: number;
  unlimited: boolean;
  upgradeAvailable: boolean;
}

export async function readApplyQuota(): Promise<QuotaState | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/me/applications/quota`, {
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as QuotaState;
  } catch {
    // API unreachable — degrade to "no banner". The Layer-3 guard at the API
    // is still in place; the user will see the 429 if they exceed the limit.
    return null;
  }
}
