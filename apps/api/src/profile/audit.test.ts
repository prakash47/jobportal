import { describe, expect, it } from 'vitest';
import { buildDiff, isDiffEmpty } from './audit';

describe('buildDiff', () => {
  it('returns {} when nothing changes', () => {
    const d = buildDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' });
    expect(isDiffEmpty(d)).toBe(true);
  });

  it('captures changed primitives', () => {
    const d = buildDiff({ a: 1, b: 'x' }, { a: 2, b: 'x' });
    expect(d).toEqual({ a: { before: 1, after: 2 } });
  });

  it('captures added and removed keys', () => {
    const d = buildDiff(
      { a: 1 } as Record<string, unknown>,
      { a: 1, b: 'new' } as Record<string, unknown>,
    );
    expect(d).toEqual({ b: { before: undefined, after: 'new' } });
  });

  it('treats arrays positionally', () => {
    const same = buildDiff({ s: [1, 2, 3] }, { s: [1, 2, 3] });
    expect(isDiffEmpty(same)).toBe(true);
    const diff = buildDiff({ s: [1, 2, 3] }, { s: [1, 3, 2] });
    expect(diff['s']).toBeDefined();
  });

  it('handles null/undefined transitions', () => {
    const d = buildDiff(
      { a: null } as Record<string, unknown>,
      { a: 'x' } as Record<string, unknown>,
    );
    expect(d['a']).toEqual({ before: null, after: 'x' });
  });
});
