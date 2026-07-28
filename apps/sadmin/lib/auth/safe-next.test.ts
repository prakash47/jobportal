import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

// Open-redirect defence for ?next=. The portal this protects is the highest
// privilege surface in the product, so the rejection list is worth pinning.
describe('safeNext', () => {
  it('passes through an ordinary same-origin path', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
  });

  it('preserves a query string', () => {
    expect(safeNext('/jobs?status=PENDING_MODERATION')).toBe('/jobs?status=PENDING_MODERATION');
  });

  // Second tuple element is the reason, rendered into the test name by %s. It is
  // unused in the body but must still be declared — vitest types the callback
  // against the FULL tuple, and tsconfig.base's noUnusedParameters exempts
  // underscore-prefixed names.
  it.each([
    ['//evil.com', 'protocol-relative'],
    ['/\\evil.com', 'backslash variant browsers normalise'],
    ['https://evil.com', 'absolute URL'],
    ['evil.com', 'schemeless host'],
    ['', 'empty'],
    [null, 'null'],
    [undefined, 'undefined'],
  ] as [string | null | undefined, string][])(
    'rejects %s (%s) and falls back to the dashboard',
    (input, _why) => {
      expect(safeNext(input)).toBe('/dashboard');
    },
  );

  // The fallback is basePath-RELATIVE. Returning '/sadmin/dashboard' here would
  // resolve to /sadmin/sadmin/dashboard once Next re-applies the prefix.
  it('falls back to a basePath-relative path, not a /sadmin-prefixed one', () => {
    expect(safeNext(null)).not.toContain('/sadmin');
  });
});
