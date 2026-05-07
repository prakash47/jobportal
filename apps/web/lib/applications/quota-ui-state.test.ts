import { describe, expect, it } from 'vitest';
import { classifyQuota } from './quota-ui-state';

describe('classifyQuota', () => {
  it("returns 'unlimited' when the flag is on", () => {
    expect(classifyQuota({ count: 999, limit: 10, unlimited: true })).toBe('unlimited');
  });

  it("returns 'normal' below 80%", () => {
    expect(classifyQuota({ count: 0, limit: 10, unlimited: false })).toBe('normal');
    expect(classifyQuota({ count: 7, limit: 10, unlimited: false })).toBe('normal');
  });

  it("returns 'warning' at 80% and above", () => {
    expect(classifyQuota({ count: 8, limit: 10, unlimited: false })).toBe('warning');
    expect(classifyQuota({ count: 9, limit: 10, unlimited: false })).toBe('warning');
  });

  it("returns 'exhausted' at and beyond the limit", () => {
    expect(classifyQuota({ count: 10, limit: 10, unlimited: false })).toBe('exhausted');
    expect(classifyQuota({ count: 11, limit: 10, unlimited: false })).toBe('exhausted');
  });

  it('handles a degenerate limit of 0 by reporting normal (no banner)', () => {
    expect(classifyQuota({ count: 5, limit: 0, unlimited: false })).toBe('normal');
  });
});
