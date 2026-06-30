import { describe, expect, it } from 'vitest';
import {
  MAX_KYC_BYTES,
  buildKycKey,
  kycFailureMessage,
  validateKycDocument,
} from './kyc-validators';

describe('validateKycDocument', () => {
  it('accepts a PDF within size', () => {
    expect(validateKycDocument('reg.pdf', 'application/pdf', 2048)).toEqual({
      ok: true,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      ext: '.pdf',
    });
  });

  it('accepts PNG / JPG / WebP image proofs', () => {
    expect(validateKycDocument('id.png', 'image/png', 10).ok).toBe(true);
    expect(validateKycDocument('id.jpg', 'image/jpeg', 10).ok).toBe(true);
    expect(validateKycDocument('id.jpeg', 'image/jpeg', 10).ok).toBe(true);
    expect(validateKycDocument('id.webp', 'image/webp', 10).ok).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(validateKycDocument('a.pdf', 'application/pdf', 0)).toMatchObject({
      ok: false,
      reason: 'EMPTY',
    });
  });

  it('rejects a file over the size cap', () => {
    expect(validateKycDocument('a.pdf', 'application/pdf', MAX_KYC_BYTES + 1)).toMatchObject({
      ok: false,
      reason: 'TOO_LARGE',
      limit: MAX_KYC_BYTES,
    });
  });

  it('rejects a disallowed extension (e.g. .docx)', () => {
    expect(validateKycDocument('a.docx', 'application/pdf', 10)).toMatchObject({
      ok: false,
      reason: 'EXT_NOT_ALLOWED',
    });
  });

  it('rejects SVG even with an image-y extension (script-injection risk)', () => {
    expect(validateKycDocument('a.svg', 'image/svg+xml', 10)).toMatchObject({
      ok: false,
      reason: 'EXT_NOT_ALLOWED',
    });
  });

  it('rejects a spoofed MIME even with an allowed extension', () => {
    expect(validateKycDocument('a.pdf', 'application/zip', 10)).toMatchObject({
      ok: false,
      reason: 'MIME_NOT_ALLOWED',
    });
  });

  it('produces friendly failure messages', () => {
    expect(kycFailureMessage({ ok: false, reason: 'EMPTY' })).toMatch(/empty/i);
    expect(
      kycFailureMessage({ ok: false, reason: 'TOO_LARGE', got: 9e9, limit: MAX_KYC_BYTES }),
    ).toMatch(/too large/i);
    expect(kycFailureMessage({ ok: false, reason: 'MIME_NOT_ALLOWED', got: 'x' })).toMatch(
      /PDF, PNG, JPG, or WebP/i,
    );
  });
});

describe('buildKycKey', () => {
  it('namespaces under kyc-documents/<companyId>/ with a lowercased docType + random suffix', () => {
    const key = buildKycKey(7, 'BUSINESS_REGISTRATION', '.pdf', 'deadbeef');
    expect(key).toMatch(/^kyc-documents\/7\/business_registration-\d+-deadbeef\.pdf$/);
    // Two slashes — a private prefix, NOT the single-segment shape the public
    // /media route expects (KYC docs are never served publicly).
    expect(key.split('/').length).toBe(3);
  });
});
