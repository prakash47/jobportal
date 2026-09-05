// SRS §4.3 — seeker profile-photo validators.
//
// Pure functions, mirroring `recruiter-profile/logo-validators.ts` so both image
// uploads in this codebase enforce the same rules and are testable outside DI.
// Two enforced rules, plus one that matters more here than it does for a logo:
//
//   1. MIME must be a safe RASTER image (PNG / JPEG / WebP). SVG is explicitly
//      NOT allowed — it is XML and can carry an embedded <script> that a virus
//      scanner will not catch but a browser will execute. That risk is sharper
//      for a profile photo than for a logo: this image is rendered INLINE in an
//      <img> on the seeker's own dashboard and is intended to be shown to
//      recruiters, so a stored payload would execute in both audiences' tabs.
//   2. Size ≤ 5 MiB. Deliberately larger than the logo's 2 MiB: a logo is an
//      asset someone exports deliberately, whereas a profile photo is usually
//      straight off a phone, and modern phone JPEGs routinely exceed 2 MiB.
//      Rejecting an ordinary selfie is a worse failure than storing a slightly
//      larger file.
//   3. The filename extension is checked as well as the MIME, because browsers
//      misreport MIME and because a double extension (`avatar.png.exe`) is the
//      classic bypass — only the TRAILING extension counts.
//
// What this does NOT do: verify magic bytes, or re-encode the image to strip
// EXIF. Phone photos carry GPS coordinates, and publishing a job seeker's home
// location to recruiters is a genuine privacy leak. Re-encoding needs `sharp`,
// which is pre-allowlisted in the root package.json's pnpm.onlyBuiltDependencies
// but is NOT a dependency of any workspace — adding it is a new top-level
// dependency and needs the owner's sign-off (CLAUDE.md §10). Recorded as a
// follow-up rather than taken unilaterally.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MiB

export const ALLOWED_PHOTO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const ALLOWED_PHOTO_EXT = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export type PhotoValidationFailure =
  | { ok: false; reason: 'MIME_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'EXT_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'TOO_LARGE'; got: number; limit: number }
  | { ok: false; reason: 'EMPTY' };

export type PhotoValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number; ext: string }
  | PhotoValidationFailure;

export function validatePhoto(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): PhotoValidationResult {
  if (sizeBytes <= 0) return { ok: false, reason: 'EMPTY' };
  if (sizeBytes > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'TOO_LARGE', got: sizeBytes, limit: MAX_PHOTO_BYTES };
  }
  const lowerName = filename.toLowerCase();
  // `endsWith` is what makes `avatar.png.exe` fail: only the trailing extension
  // is considered, so a double extension cannot smuggle anything through.
  const ext = ALLOWED_PHOTO_EXT.find((e) => lowerName.endsWith(e));
  if (!ext) return { ok: false, reason: 'EXT_NOT_ALLOWED', got: lowerName };
  if (!ALLOWED_PHOTO_MIME.includes(mimeType as (typeof ALLOWED_PHOTO_MIME)[number])) {
    return { ok: false, reason: 'MIME_NOT_ALLOWED', got: mimeType };
  }
  return { ok: true, mimeType, sizeBytes, ext };
}

/**
 * The message shown to the seeker.
 *
 * Deliberately never echoes the caller's filename or MIME back: the string
 * lands in the DOM, and reflecting attacker-controlled text into the page is
 * how a rejected upload becomes a different kind of problem.
 */
export function photoFailureMessage(v: PhotoValidationFailure): string {
  switch (v.reason) {
    case 'EMPTY':
      return 'That file is empty';
    case 'TOO_LARGE':
      return `Photo is too large (max ${Math.round(v.limit / (1024 * 1024))} MB)`;
    case 'EXT_NOT_ALLOWED':
      return 'File extension not allowed (PNG, JPG, or WebP only)';
    case 'MIME_NOT_ALLOWED':
      return 'File type not allowed (PNG, JPG, or WebP only)';
    default:
      return 'File rejected';
  }
}

/**
 * A stable, single-segment storage key.
 *
 * Exactly one slash (the `profile-photos/` prefix) so the dev passthrough route
 * `/media/profile-photos/:file` maps cleanly without a wildcard segment — the
 * same shape constraint the company-logo key has. The random suffix prevents
 * same-millisecond collisions and makes keys impractical to enumerate, which is
 * what keeps a public passthrough from being a directory of everyone's face.
 */
export function buildProfilePhotoKey(userId: number, ext: string, randomHex: string): string {
  return `profile-photos/${userId}-${Date.now()}-${randomHex}${ext}`;
}
