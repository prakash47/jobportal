import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

// `Company.logoUrl` holds an ABSOLUTE url minted when the logo was uploaded, so
// a logo added before R2 was provisioned carries a `http://localhost:4000`
// origin forever. This site reads that column straight out of Prisma — into
// <img> tags AND into the `logo` field of the Organization / JobPosting JSON-LD
// that Google indexes — so it is re-derived here against whatever is configured
// now.
//
// CALL IT AT THE DATA SOURCE, not in the rendering component. `CompanyLogo` has
// no 'use client' directive but IS imported by client components (the nav
// panels), so resolving inside it would read unprefixed env that Next strips
// from the client bundle and silently no-op in some trees while working in
// others. Every server-side loader that selects `logoUrl` wraps it instead:
// the companies directory, company detail (incl. related companies), job
// detail, the working-at landing, SRP shell and rail, recommended jobs, and
// the nav menu data.
//
// Server-only by design: it reads unprefixed env. The values it produces are of
// course fine to send to the browser.
export function publicAssetUrl(stored: string | null | undefined): string | null {
  return resolveStoredAssetUrl(stored, {
    publicBase: process.env.R2_PUBLIC_URL,
    // NEXT_PUBLIC_API_URL is the browser-reachable origin, which is what an
    // <img src> needs — API_URL may be an internal address the browser cannot
    // resolve, so it is the wrong fallback for a rendered asset.
    apiBase: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  });
}
