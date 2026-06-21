import { describe, expect, it } from 'vitest';
import {
  MAX_LOGO_BYTES,
  buildLogoKey,
  logoFailureMessage,
  validateLogo,
} from './logo-validators';

describe('validateLogo', () => {
  it('accepts a PNG within size', () => {
    const r = validateLogo('acme.png', 'image/png', 1024);
    expect(r).toEqual({ ok: true, mimeType: 'image/png', sizeBytes: 1024, ext: '.png' });
  });

  it('accepts JPG / JPEG / WebP', () => {
    expect(validateLogo('a.jpg', 'image/jpeg', 10).ok).toBe(true);
    expect(validateLogo('a.jpeg', 'image/jpeg', 10).ok).toBe(true);
    expect(validateLogo('a.webp', 'image/webp', 10).ok).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(validateLogo('a.png', 'image/png', 0)).toMatchObject({ ok: false, reason: 'EMPTY' });
  });

  it('rejects a file over the size cap', () => {
    expect(validateLogo('a.png', 'image/png', MAX_LOGO_BYTES + 1)).toMatchObject({
      ok: false,
      reason: 'TOO_LARGE',
      limit: MAX_LOGO_BYTES,
    });
  });

  it('rejects a disallowed extension', () => {
    expect(validateLogo('a.gif', 'image/gif', 10)).toMatchObject({
      ok: false,
      reason: 'EXT_NOT_ALLOWED',
    });
  });

  it('rejects SVG even with an image-y extension (script-injection risk)', () => {
    // .svg is not in the allowlist → EXT_NOT_ALLOWED before MIME is even checked.
    expect(validateLogo('a.svg', 'image/svg+xml', 10)).toMatchObject({
      ok: false,
      reason: 'EXT_NOT_ALLOWED',
    });
  });

  it('rejects a spoofed MIME even with an allowed extension', () => {
    expect(validateLogo('a.png', 'application/pdf', 10)).toMatchObject({
      ok: false,
      reason: 'MIME_NOT_ALLOWED',
    });
  });

  it('produces friendly failure messages', () => {
    expect(logoFailureMessage({ ok: false, reason: 'EMPTY' })).toMatch(/empty/i);
    expect(
      logoFailureMessage({ ok: false, reason: 'TOO_LARGE', got: 9e9, limit: MAX_LOGO_BYTES }),
    ).toMatch(/too large/i);
    expect(logoFailureMessage({ ok: false, reason: 'MIME_NOT_ALLOWED', got: 'x' })).toMatch(
      /PNG, JPG, or WebP/i,
    );
  });
});

describe('buildLogoKey', () => {
  it('produces a single-segment company-logos key with the random suffix + ext', () => {
    const key = buildLogoKey(7, '.png', 'deadbeef');
    expect(key).toMatch(/^company-logos\/7-\d+-deadbeef\.png$/);
    // Exactly one slash so the /media/company-logos/:file route matches cleanly.
    expect(key.split('/').length).toBe(2);
  });
});
