import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PHOTO_EXT,
  ALLOWED_PHOTO_MIME,
  MAX_PHOTO_BYTES,
  buildProfilePhotoKey,
  photoFailureMessage,
  validatePhoto,
} from './photo-validators';

// Mirrors the company-logo validators, which these are modelled on. The rules
// that matter for a photo specifically are asserted here rather than assumed.

describe('validatePhoto — what is accepted', () => {
  it('accepts the three safe raster formats', () => {
    for (const [name, mime] of [
      ['selfie.png', 'image/png'],
      ['selfie.jpg', 'image/jpeg'],
      ['selfie.jpeg', 'image/jpeg'],
      ['selfie.webp', 'image/webp'],
    ] as const) {
      const v = validatePhoto(name, mime, 1024);
      expect(v.ok, `${name} ${mime}`).toBe(true);
    }
  });

  it('is case-insensitive about the extension', () => {
    expect(validatePhoto('SELFIE.JPG', 'image/jpeg', 1024).ok).toBe(true);
  });
});

describe('validatePhoto — what is refused', () => {
  // THE security rule. An SVG is XML: it can carry <script>, and this photo is
  // rendered INLINE in an <img> on the dashboard and (eventually) in front of
  // recruiters. A virus scanner will not flag it; a browser will run it.
  it('refuses SVG even when the extension looks fine', () => {
    expect(validatePhoto('avatar.svg', 'image/svg+xml', 1024).ok).toBe(false);
    // ...and refuses an SVG payload wearing a PNG extension.
    expect(validatePhoto('avatar.png', 'image/svg+xml', 1024).ok).toBe(false);
  });

  it('refuses a mismatched or hostile extension', () => {
    expect(validatePhoto('resume.pdf', 'application/pdf', 1024).ok).toBe(false);
    expect(validatePhoto('shell.php', 'image/png', 1024).ok).toBe(false);
    expect(validatePhoto('noextension', 'image/png', 1024).ok).toBe(false);
  });

  // A double extension is the classic bypass: only the trailing one counts.
  it('refuses a double extension whose LAST part is not an image', () => {
    expect(validatePhoto('avatar.png.exe', 'image/png', 1024).ok).toBe(false);
  });

  it('refuses an empty file', () => {
    const v = validatePhoto('selfie.png', 'image/png', 0);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('EMPTY');
  });

  it('refuses anything over the size cap, and accepts exactly the cap', () => {
    expect(validatePhoto('selfie.png', 'image/png', MAX_PHOTO_BYTES).ok).toBe(true);
    const over = validatePhoto('selfie.png', 'image/png', MAX_PHOTO_BYTES + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('TOO_LARGE');
  });
});

describe('photoFailureMessage', () => {
  it('explains every failure without leaking the raw input back', () => {
    const cases = [
      validatePhoto('a.svg', 'image/svg+xml', 10),
      validatePhoto('a.png', 'image/png', 0),
      validatePhoto('a.png', 'image/png', MAX_PHOTO_BYTES + 1),
      validatePhoto('a.exe', 'application/x-msdownload', 10),
    ];
    for (const c of cases) {
      expect(c.ok).toBe(false);
      if (c.ok) continue;
      const msg = photoFailureMessage(c);
      expect(msg.length).toBeGreaterThan(5);
      // Never echo a caller-supplied filename or MIME back into the response —
      // it lands in the DOM as an error string.
      expect(msg).not.toContain('.exe');
      expect(msg).not.toContain('svg+xml');
    }
  });

  it('states the limit in the size message so the user can act on it', () => {
    const v = validatePhoto('a.png', 'image/png', MAX_PHOTO_BYTES + 1);
    if (v.ok) throw new Error('expected failure');
    expect(photoFailureMessage(v)).toMatch(/\d/);
  });
});

describe('buildProfilePhotoKey', () => {
  // The media passthrough matches a regex on the filename, so the key shape is
  // load-bearing: exactly one slash, and a name the route will accept.
  it('produces a single-segment key under the photo prefix', () => {
    const key = buildProfilePhotoKey(42, '.png', 'a1b2c3d4');
    expect(key.startsWith('profile-photos/')).toBe(true);
    expect(key.split('/')).toHaveLength(2);
    expect(key.endsWith('.png')).toBe(true);
    expect(key).toContain('42-');
  });

  it('includes the random suffix so keys are not enumerable', () => {
    const a = buildProfilePhotoKey(42, '.png', 'aaaaaaaa');
    const b = buildProfilePhotoKey(42, '.png', 'bbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('only ever emits an allowed extension', () => {
    for (const ext of ALLOWED_PHOTO_EXT) {
      expect(buildProfilePhotoKey(1, ext, 'deadbeef').endsWith(ext)).toBe(true);
    }
  });
});

describe('the allowlists themselves', () => {
  it('does not contain SVG in either list', () => {
    expect(ALLOWED_PHOTO_MIME as readonly string[]).not.toContain('image/svg+xml');
    expect(ALLOWED_PHOTO_EXT as readonly string[]).not.toContain('.svg');
  });

  it('caps size at something a phone photo can actually meet', () => {
    // A 5 MiB cap: modern phone photos routinely exceed 2 MiB, and rejecting a
    // normal selfie is a worse failure than storing a slightly larger file.
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });
});
