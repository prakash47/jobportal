// SRS §4.3.4 — resume validators (pure functions so they're trivially testable
// outside Nest's DI). Two enforced rules:
//   1. MIME must be one of the allowlist (PDF or DOCX).
//   2. Size must be ≤ 5 MiB.
// Filename's extension is also checked, since some browsers misreport MIME
// (e.g. .docx as application/octet-stream).

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MiB

export const ALLOWED_RESUME_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
] as const;

export const ALLOWED_RESUME_EXT = ['.pdf', '.docx', '.doc'] as const;

export type ValidationFailure =
  | { ok: false; reason: 'MIME_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'EXT_NOT_ALLOWED'; got: string }
  | { ok: false; reason: 'TOO_LARGE'; got: number; limit: number }
  | { ok: false; reason: 'EMPTY' };

export type ValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number; ext: string }
  | ValidationFailure;

export function validateResume(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): ValidationResult {
  if (sizeBytes <= 0) return { ok: false, reason: 'EMPTY' };
  if (sizeBytes > MAX_RESUME_BYTES) {
    return { ok: false, reason: 'TOO_LARGE', got: sizeBytes, limit: MAX_RESUME_BYTES };
  }
  const lowerName = filename.toLowerCase();
  const ext = ALLOWED_RESUME_EXT.find((e) => lowerName.endsWith(e));
  if (!ext) return { ok: false, reason: 'EXT_NOT_ALLOWED', got: lowerName };
  if (!ALLOWED_RESUME_MIME.includes(mimeType as (typeof ALLOWED_RESUME_MIME)[number])) {
    return { ok: false, reason: 'MIME_NOT_ALLOWED', got: mimeType };
  }
  return { ok: true, mimeType, sizeBytes, ext };
}

// Builds a stable R2 key from candidate id + a random suffix. Random suffix
// prevents key collisions between two uploads in the same millisecond and
// makes presigned URLs harder to enumerate.
export function buildResumeKey(candidateId: number, ext: string, randomHex: string): string {
  return `resumes/c${candidateId}/${Date.now()}-${randomHex}${ext}`;
}
