import { describe, expect, it } from 'vitest';
import { bucket } from './hash';

describe('bucket', () => {
  it('is deterministic for the same input', () => {
    expect(bucket(42, 'experiment.test')).toBe(bucket(42, 'experiment.test'));
  });

  it('returns a value in [0, 99]', () => {
    for (let i = 0; i < 200; i += 1) {
      const b = bucket(i, 'experiment.test');
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('produces a reasonably uniform distribution across users', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(bucket(i, 'experiment.distribution'));
    }
    // Across 200 users on a 0..99 range, hitting more than half the buckets is
    // essentially certain; this guards against accidental degenerate hashing.
    expect(seen.size).toBeGreaterThan(50);
  });

  it('different flag keys produce independent buckets for the same user', () => {
    // For a fixed user, varying the key should change the bucket some of the time.
    let differentCount = 0;
    for (let i = 0; i < 50; i += 1) {
      if (bucket(7, `experiment.k${i}`) !== bucket(7, 'experiment.k0')) {
        differentCount += 1;
      }
    }
    expect(differentCount).toBeGreaterThan(20);
  });
});
