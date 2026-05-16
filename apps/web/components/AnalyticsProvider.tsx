'use client';

import { useEffect } from 'react';
import { identify } from '../lib/analytics/posthog';

// Phase 1 item 18 — mounted once at the root layout level. Identifies
// the authenticated user to PostHog on first render so subsequent
// events (including the auto pageview) are attributed correctly.
// Anon visitors are not identified — PostHog uses its own anon
// distinct_id which becomes aliased once they sign in.
//
// Server-rendered: the auth check happens in the layout (so this
// component doesn't itself fetch /me/auth/me), and the resolved user
// is passed in as a prop. A null prop means anon visitor and we skip
// identify entirely.
export function AnalyticsProvider({
  user,
}: {
  user: { sub: number; email: string; role: string } | null;
}) {
  useEffect(() => {
    if (!user) return;
    identify(user.sub, { email: user.email, role: user.role });
  }, [user]);

  // No visible UI — this component exists only to register the effect.
  return null;
}
