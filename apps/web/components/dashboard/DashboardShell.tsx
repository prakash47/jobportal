import { cache } from 'react';
import { prisma } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';
import { DashboardChrome } from './DashboardChrome';
import { DailyApplyIndicator } from '../profile/DailyApplyIndicator';

// Memoised per request so the shell's name lookup dedupes across re-renders
// (and any page that adopts this helper) instead of hitting the DB each time.
const getDisplayName = cache(async (userId: number): Promise<string | null> => {
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return profile?.name?.trim() || null;
});

// Server wrapper for the seeker dashboard app-shell. Each authed section layout
// resolves the session (requireUser) and hands the claims here; the shell looks
// up the display name once and renders the persistent chrome around the page.
export async function DashboardShell({
  user,
  children,
}: {
  user: AccessClaims;
  children: React.ReactNode;
}) {
  const name = (await getDisplayName(user.sub)) ?? user.email;

  return (
    <DashboardChrome user={{ name, email: user.email }} quotaSlot={<DailyApplyIndicator />}>
      {children}
    </DashboardChrome>
  );
}
