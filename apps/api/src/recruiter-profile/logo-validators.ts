// SRS §4.9 — company-logo validators (pure functions, mirror of the resume
// validators so they're trivially testable outside Nest's DI). Two enforced
// rules:
//   1. MIME must be a safe RASTER image (PNG / JPEG / WebP). SVG is explicitly
//      NOT allowed — it is XML and can carry an embedded <script> payload that
//      a virus scanner won't catch but a browser will execute.
//   2. Size must be ≤ 2 MiB (a logo is small; this is generous headroom).
// The filename extension is also checked since some browsers misreport MIME.

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MiB

export const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const ALLOWED_LOGO_EXT = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export type LogoValidationFailure =
  | { ok: false; reason: 'MIME_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'EXT_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'TOO_LARGE'; got: number; limit: number }
  | { ok: false; reason: 'EMPTY' };

export type LogoValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number; ext: string }
  | LogoValidationFailure;

export function validateLogo(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): LogoValidationResult {
  if (sizeBytes <= 0) return { ok: false, reason: 'EMPTY' };
  if (sizeBytes > MAX_LOGO_BYTES) {
    return { ok: false, reason: 'TOO_LARGE', got: sizeBytes, limit: MAX_LOGO_BYTES };
  }
  const lowerName = filename.toLowerCase();
  const ext = ALLOWED_LOGO_EXT.find((e) => lowerName.endsWith(e));
  if (!ext) return { ok: false, reason: 'EXT_NOT_ALLOWED', got: lowerName };
  if (!ALLOWED_LOGO_MIME.includes(mimeType as (typeof ALLOWED_LOGO_MIME)[number])) {
    return { ok: false, reason: 'MIME_NOT_ALLOWED', got: mimeType };
  }
  return { ok: true, mimeType, sizeBytes, ext };
}

export function logoFailureMessage(v: LogoValidationFailure): string {
  switch (v.reason) {
    case 'EMPTY':
      return 'File is empty';
    case 'TOO_LARGE':
      return `Logo is too large (max ${Math.round(v.limit / 1024)} KB)`;
    case 'EXT_NOT_ALLOWED':
      return 'File extension not allowed (PNG, JPG, or WebP only)';
    case 'MIME_NOT_ALLOWED':
      return 'File type not allowed (PNG, JPG, or WebP only)';
    default:
      return 'File rejected';
  }
}

// Builds a stable, single-segment R2 key for the company logo. The key has
// exactly one slash (the `company-logos/` prefix) so the public dev passthrough
// route (/media/company-logos/:file) maps cleanly without a wildcard segment.
// The random suffix avoids same-millisecond collisions and makes keys hard to
// enumerate.
export function buildLogoKey(companyId: number, ext: string, randomHex: string): string {
  return `company-logos/${companyId}-${Date.now()}-${randomHex}${ext}`;
}
