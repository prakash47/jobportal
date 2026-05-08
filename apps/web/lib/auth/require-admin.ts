// Server-side guard for /admin/* routes. Calls readUserFromCookie() and
// 404s on:
//   1. No session (anon) — same shape as a non-existent route, no leak.
//   2. Authed but role !== ADMIN — same 404 so a candidate with the URL
//      can't tell whether /admin exists.
//
// Returning notFound() instead of redirect-to-login is deliberate: per
// SRS §4.16, the admin console URL is not advertised, and a 302 to
// /login would prove the route exists. The handful of legitimate
// admins know the URL.

import { notFound } from 'next/navigation';
import type { AccessClaims } from '@jobportal/auth';
import { readUserFromCookie } from './server-session';

export async function requireAdmin(): Promise<AccessClaims> {
  const user = await readUserFromCookie();
  if (!user || user.role !== 'ADMIN') notFound();
  return user;
}
