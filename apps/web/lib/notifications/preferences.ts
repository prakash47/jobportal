// SRS §4.13.4 — server-side fetch + write helpers for the email-channel
// preferences. Forwards the access cookie so the API treats the request
// as the current user.

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface NotificationPreferences {
  jobAlertsEnabled: boolean;
  applicationStatusEnabled: boolean;
  productNewsEnabled: boolean;
}

export async function readPreferences(): Promise<NotificationPreferences | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/me/notifications`, {
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as NotificationPreferences;
  } catch {
    return null;
  }
}
