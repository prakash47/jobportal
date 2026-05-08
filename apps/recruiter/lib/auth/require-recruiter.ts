// Server gate for every authed page in the recruiter portal. Two checks:
//   1. Anonymous → 302 to /login?next=<original-path>
//   2. Authed but role !== 'RECRUITER' → 302 to the candidate site
//
// Two layers (this gate + the RolesGuard on apps/api endpoints they will
// hit) so a candidate cannot poke recruiter routes even if the cookie is
// shared via the parent domain. CLAUDE.md §4 (defence in depth).

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AccessClaims } from '@jobportal/auth';
import { readUserFromCookie } from './server-session';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export async function requireRecruiter(): Promise<AccessClaims> {
  const user = await readUserFromCookie();

  if (!user) {
    const h = await headers();
    const path = h.get('x-canonical-pathname') ?? '/dashboard';
    const search = h.get('x-canonical-search') ?? '';
    const next = encodeURIComponent(`${path}${search}`);
    redirect(`/login?next=${next}`);
  }

  if (user.role !== 'RECRUITER') {
    // Not a recruiter — the candidate side is where they belong. We do not
    // try to deep-link them anywhere specific; they probably hit /recruit
    // by accident.
    redirect(WEB_URL);
  }

  return user;
}
