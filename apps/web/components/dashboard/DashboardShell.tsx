import { cache } from 'react';
import { prisma } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';
import { DashboardChrome } from './DashboardChrome';
import { DailyApplyIndicator } from '../profile/DailyApplyIndicator';
import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

// Memoised per request so the shell's name lookup dedupes across re-renders
// (and any page that adopts this helper) instead of hitting the DB each time.
const getIdentity = cache(
  async (userId: number): Promise<{ name: string | null; image: string | null }> => {
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, image: true },
    });
    return { name: profile?.name?.trim() || null, image: profile?.image ?? null };
  },
);

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
  const identity = await getIdentity(user.sub);
  const name = identity.name ?? user.email;
  // Re-derived on read: a photo stored while R2_PUBLIC_URL was blank carries a
  // localhost origin in the row, and only resolving here makes it self-heal.
  const imageUrl = resolveStoredAssetUrl(identity.image, {
    publicBase: process.env.R2_PUBLIC_URL ?? '',
    apiBase: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  });

  return (
    <DashboardChrome user={{ name, email: user.email, imageUrl }} quotaSlot={<DailyApplyIndicator />}>
      {children}
    </DashboardChrome>
  );
}
