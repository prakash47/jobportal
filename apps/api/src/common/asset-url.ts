import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

/**
 * Re-derive a stored asset URL against the bases configured right now.
 *
 * Same job as `StorageService.resolveStoredUrl`, in function form, for the
 * public read services — they are pure Prisma serialisers with no constructor
 * dependencies, and injecting StorageService into them just to reach one pure
 * helper would give them a dependency on the upload stack they otherwise have
 * no business knowing about.
 *
 * Both call through the SAME implementation in `@jobportal/domain`, which is
 * also what `apps/web` uses, so the website and the API cannot disagree about
 * what a stored URL resolves to.
 */
export function publicAssetUrl(stored: string | null | undefined): string | null {
  return resolveStoredAssetUrl(stored, {
    publicBase: process.env.R2_PUBLIC_URL,
    apiBase: process.env.API_URL ?? 'http://localhost:4000',
  });
}
