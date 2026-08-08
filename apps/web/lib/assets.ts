import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

// `Company.logoUrl` holds an ABSOLUTE url minted when the logo was uploaded, so
// a logo added before R2 was provisioned carries a `http://localhost:4000`
// origin forever. This site reads that column straight out of Prisma — into
// <img> tags AND into the `logo` field of the Organization / JobPosting JSON-LD
// that Google indexes — so every read goes through here to re-derive the origin
// against whatever is configured now.
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
