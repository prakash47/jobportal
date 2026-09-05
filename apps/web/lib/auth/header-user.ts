import { cache } from 'react';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from './server-session';
import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

export interface HeaderSessionUser {
  name: string;
  email: string;
  role: string;
  /**
   * The profile photo, already re-derived against the CURRENT asset bases.
   *
   * Resolved here rather than at each render site so every consumer gets a URL
   * that is right for the environment it is running in — a photo uploaded while
   * R2_PUBLIC_URL was blank has a localhost origin frozen into the row, and
   * only resolving on read makes those self-heal. Null when the user has no
   * photo; a Google avatar URL passes through untouched.
   */
  imageUrl: string | null;
}

// Server-side resolution of the signed-in user for the shared site header.
// `React.cache` dedupes the work within a single request (both the brand-link
// href and the auth actions need it). Returns null for anon.
//
// This is the SAME cookie + JWT path the dashboard shell uses, so the public
// header and the dashboard can never disagree about auth state — which was the
// bug: the header resolved auth on the client (GET /auth/me) and flashed
// "Sign in / Register" for a signed-in seeker on /jobs, /job/[slug], etc. The
// name is a light indexed PK lookup, only for signed-in users; anon returns
// early with no query. Pages using the header are already dynamic, so this adds
// no static-rendering penalty.
export const getHeaderUser = cache(async (): Promise<HeaderSessionUser | null> => {
  const claims = await readUserFromCookie();
  if (!claims) return null;
  const row = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { name: true, image: true },
  });
  const name = row?.name?.trim() ? row.name : claims.email;
  return {
    name,
    email: claims.email,
    role: String(claims.role),
    // Resolved here rather than at the render site so every consumer of
    // getHeaderUser gets a URL that is correct for the CURRENT asset bases.
    imageUrl: resolveStoredAssetUrl(row?.image ?? null, {
      publicBase: process.env.R2_PUBLIC_URL ?? '',
      apiBase: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    }),
  };
});
