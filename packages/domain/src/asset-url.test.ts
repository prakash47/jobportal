import { describe, expect, it } from 'vitest';
import { resolveStoredAssetUrl, storageKeyFromUrl } from './asset-url';

const LOCAL = { apiBase: 'http://localhost:4000' };
const CDN = { publicBase: 'https://cdn.example.com', apiBase: 'https://api.example.com' };

describe('storageKeyFromUrl', () => {
  it('extracts the key from a /media URL on any origin', () => {
    expect(storageKeyFromUrl('http://localhost:4000/media/logos/1/a.png', LOCAL)).toBe(
      'logos/1/a.png',
    );
    // The ENTIRE point: a row written under one origin must still be
    // recognisable after the API has moved, or it could never be repaired.
    expect(storageKeyFromUrl('http://localhost:4000/media/logos/1/a.png', CDN)).toBe(
      'logos/1/a.png',
    );
  });

  it('extracts the key from a CDN URL', () => {
    expect(storageKeyFromUrl('https://cdn.example.com/logos/1/a.png', CDN)).toBe('logos/1/a.png');
  });

  it('returns null for a URL we did not mint', () => {
    expect(storageKeyFromUrl('https://lh3.googleusercontent.com/a/x', CDN)).toBeNull();
    expect(storageKeyFromUrl('https://acme.com/brand/logo.svg', LOCAL)).toBeNull();
  });

  it('returns null for relative or malformed values', () => {
    expect(storageKeyFromUrl('/media/logos/1/a.png', LOCAL)).toBeNull();
    expect(storageKeyFromUrl('not a url', LOCAL)).toBeNull();
    expect(storageKeyFromUrl('', LOCAL)).toBeNull();
  });

  // A javascript: or data: URL that happens to contain "/media/" must not be
  // treated as ours and echoed into an <img src> or a JSON-LD logo field.
  it('ignores non-http protocols', () => {
    expect(storageKeyFromUrl('javascript:/media/x', LOCAL)).toBeNull();
    expect(storageKeyFromUrl('data:image/png;base64,AAAA', LOCAL)).toBeNull();
  });
});

describe('resolveStoredAssetUrl', () => {
  it('passes null and empty straight through', () => {
    expect(resolveStoredAssetUrl(null, CDN)).toBeNull();
    expect(resolveStoredAssetUrl(undefined, CDN)).toBeNull();
    expect(resolveStoredAssetUrl('', CDN)).toBeNull();
  });

  // The bug this file exists for: a logo uploaded before R2 was provisioned
  // keeps a localhost origin forever, including inside the JSON-LD Google reads.
  it('re-points a stale localhost URL at the CDN once one is configured', () => {
    expect(resolveStoredAssetUrl('http://localhost:4000/media/logos/1/a.png', CDN)).toBe(
      'https://cdn.example.com/logos/1/a.png',
    );
  });

  it('re-points at the current API when no CDN is configured', () => {
    expect(
      resolveStoredAssetUrl('http://localhost:4000/media/logos/1/a.png', {
        apiBase: 'https://api.example.com',
      }),
    ).toBe('https://api.example.com/media/logos/1/a.png');
  });

  it('is a no-op when the origin already matches', () => {
    const url = 'https://cdn.example.com/logos/1/a.png';
    expect(resolveStoredAssetUrl(url, CDN)).toBe(url);
  });

  // Rewriting somebody else's URL would be worse than leaving a stale one.
  it('never rewrites an external URL', () => {
    const google = 'https://lh3.googleusercontent.com/a/x';
    expect(resolveStoredAssetUrl(google, CDN)).toBe(google);
    const external = 'https://acme.com/brand/logo.svg';
    expect(resolveStoredAssetUrl(external, LOCAL)).toBe(external);
  });

  it('returns the stored value unchanged when no base is configured at all', () => {
    const url = 'http://localhost:4000/media/logos/1/a.png';
    expect(resolveStoredAssetUrl(url, {})).toBe(url);
  });

  it('tolerates a trailing slash on either base', () => {
    expect(
      resolveStoredAssetUrl('http://localhost:4000/media/l/a.png', {
        publicBase: 'https://cdn.example.com/',
      }),
    ).toBe('https://cdn.example.com/l/a.png');
  });

  // Keys with spaces or unicode round-trip through the URL encoding.
  it('round-trips an encoded key', () => {
    expect(
      resolveStoredAssetUrl('http://localhost:4000/media/logos/1/my%20logo.png', {
        publicBase: 'https://cdn.example.com',
      }),
    ).toBe('https://cdn.example.com/logos/1/my logo.png');
  });
});
