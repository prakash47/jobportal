import { describe, expect, it } from 'vitest';
import { buildResumeKey, MAX_RESUME_BYTES, validateResume } from './validators';

describe('validateResume', () => {
  it('accepts a PDF under 5 MiB', () => {
    const r = validateResume('cv.pdf', 'application/pdf', 100_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ext).toBe('.pdf');
  });

  it('accepts a DOCX under 5 MiB', () => {
    const r = validateResume(
      'Prakash_Resume.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      500_000,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects empty files', () => {
    const r = validateResume('cv.pdf', 'application/pdf', 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EMPTY');
  });

  it('rejects oversize files', () => {
    const r = validateResume('cv.pdf', 'application/pdf', MAX_RESUME_BYTES + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TOO_LARGE');
  });

  it('rejects disallowed extensions', () => {
    const r = validateResume('cv.zip', 'application/zip', 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EXT_NOT_ALLOWED');
  });

  it('rejects disallowed MIME types', () => {
    const r = validateResume('cv.pdf', 'image/jpeg', 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('MIME_NOT_ALLOWED');
  });

  it('case-insensitive on extension', () => {
    const r = validateResume('CV.PDF', 'application/pdf', 1024);
    expect(r.ok).toBe(true);
  });
});

describe('buildResumeKey', () => {
  it('namespaces by candidate id', () => {
    const k = buildResumeKey(42, '.pdf', 'abc123');
    expect(k.startsWith('resumes/c42/')).toBe(true);
    expect(k.endsWith('-abc123.pdf')).toBe(true);
  });
});
