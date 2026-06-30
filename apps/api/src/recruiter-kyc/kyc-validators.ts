// Recruiter Company-Verification (KYC) document validators. Pure functions
// (mirror of the logo / resume validators) so they're trivially testable outside
// Nest's DI. Two enforced rules:
//   1. MIME must be a PDF or a safe RASTER image (PNG / JPEG / WebP). SVG is
//      explicitly NOT allowed — it is XML and can carry an embedded <script>.
//   2. Size must be ≤ 10 MiB (a scanned registration certificate is larger than
//      a logo; this is generous headroom).
// The filename extension is also checked since some browsers misreport MIME.

import type { KycDocumentType } from '@jobportal/db';

export const MAX_KYC_BYTES = 10 * 1024 * 1024; // 10 MiB

export const ALLOWED_KYC_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const ALLOWED_KYC_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'] as const;

export type KycValidationFailure =
  | { ok: false; reason: 'MIME_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'EXT_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'TOO_LARGE'; got: number; limit: number }
  | { ok: false; reason: 'EMPTY' };

export type KycValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number; ext: string }
  | KycValidationFailure;

export function validateKycDocument(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): KycValidationResult {
  if (sizeBytes <= 0) return { ok: false, reason: 'EMPTY' };
  if (sizeBytes > MAX_KYC_BYTES) {
    return { ok: false, reason: 'TOO_LARGE', got: sizeBytes, limit: MAX_KYC_BYTES };
  }
  const lowerName = filename.toLowerCase();
  const ext = ALLOWED_KYC_EXT.find((e) => lowerName.endsWith(e));
  if (!ext) return { ok: false, reason: 'EXT_NOT_ALLOWED', got: lowerName };
  if (!ALLOWED_KYC_MIME.includes(mimeType as (typeof ALLOWED_KYC_MIME)[number])) {
    return { ok: false, reason: 'MIME_NOT_ALLOWED', got: mimeType };
  }
  return { ok: true, mimeType, sizeBytes, ext };
}

export function kycFailureMessage(v: KycValidationFailure): string {
  switch (v.reason) {
    case 'EMPTY':
      return 'File is empty';
    case 'TOO_LARGE':
      return `File is too large (max ${Math.round(v.limit / (1024 * 1024))} MB)`;
    case 'EXT_NOT_ALLOWED':
      return 'File extension not allowed (PDF, PNG, JPG, or WebP only)';
    case 'MIME_NOT_ALLOWED':
      return 'File type not allowed (PDF, PNG, JPG, or WebP only)';
    default:
      return 'File rejected';
  }
}

// Builds a PRIVATE R2 key for a KYC document, namespaced under the company id.
// Unlike company logos, this key is NEVER served from the public /media route —
// KYC documents are sensitive PII (DPDP Act 2023) and are only ever delivered
// via short-lived signed URLs to the owning recruiter + admins. The random
// suffix avoids same-millisecond collisions and makes keys hard to enumerate.
export function buildKycKey(
  companyId: number,
  docType: KycDocumentType,
  ext: string,
  randomHex: string,
): string {
  return `kyc-documents/${companyId}/${docType.toLowerCase()}-${Date.now()}-${randomHex}${ext}`;
}
