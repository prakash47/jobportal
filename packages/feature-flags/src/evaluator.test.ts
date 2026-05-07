import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluator';
import type { FeatureFlag } from './types';

function makeFlag(type: FeatureFlag['type'], overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: 1,
    key: 'test.flag',
    description: null,
    uiLabel: null,
    category: 'features',
    type,
    enabled: true,
    percentage: null,
    targetUserIds: [],
    requiredTiers: [],
    cohorts: [],
    createdById: null,
    lastChangedById: null,
    createdAt: new Date('2026-05-07'),
    updatedAt: new Date('2026-05-07'),
    ...overrides,
  };
}

describe('evaluate', () => {
  it('returns flag_off when flag is null', () => {
    expect(evaluate(null, {})).toEqual({ enabled: false, reason: 'flag_off' });
  });

  it('returns flag_off when flag.enabled is false', () => {
    const flag = makeFlag('BOOLEAN', { enabled: false });
    expect(evaluate(flag, {})).toEqual({ enabled: false, reason: 'flag_off' });
  });

  describe('BOOLEAN', () => {
    it('returns flag_on when enabled', () => {
      const flag = makeFlag('BOOLEAN');
      expect(evaluate(flag, {})).toEqual({ enabled: true, reason: 'flag_on' });
    });
  });

  describe('USER_TARGETED', () => {
    it('returns true when userId is in targetUserIds', () => {
      const flag = makeFlag('USER_TARGETED', { targetUserIds: [42, 99] });
      expect(evaluate(flag, { userId: 42 })).toEqual({ enabled: true, reason: 'user_targeted' });
    });

    it('returns false when userId is not in targetUserIds', () => {
      const flag = makeFlag('USER_TARGETED', { targetUserIds: [42] });
      expect(evaluate(flag, { userId: 99 })).toEqual({ enabled: false, reason: 'user_targeted' });
    });

    it('returns no_user when context has no userId', () => {
      const flag = makeFlag('USER_TARGETED', { targetUserIds: [42] });
      expect(evaluate(flag, {})).toEqual({ enabled: false, reason: 'no_user' });
    });
  });

  describe('TIER_GATED', () => {
    it('returns true when tier is in requiredTiers', () => {
      const flag = makeFlag('TIER_GATED', { requiredTiers: ['PREMIUM', 'ENTERPRISE'] });
      expect(evaluate(flag, { tier: 'PREMIUM' })).toEqual({ enabled: true, reason: 'tier_match' });
    });

    it('returns false when tier is not in requiredTiers', () => {
      const flag = makeFlag('TIER_GATED', { requiredTiers: ['PREMIUM'] });
      expect(evaluate(flag, { tier: 'BASIC' })).toEqual({ enabled: false, reason: 'tier_match' });
    });

    it('returns no_tier when context has no tier', () => {
      const flag = makeFlag('TIER_GATED', { requiredTiers: ['PREMIUM'] });
      expect(evaluate(flag, {})).toEqual({ enabled: false, reason: 'no_tier' });
    });
  });

  describe('PERCENTAGE_ROLLOUT', () => {
    it('is deterministic for the same userId and flag key', () => {
      const flag = makeFlag('PERCENTAGE_ROLLOUT', { percentage: 50, key: 'exp.foo' });
      const r1 = evaluate(flag, { userId: 42 });
      const r2 = evaluate(flag, { userId: 42 });
      expect(r1).toEqual(r2);
    });

    it('always returns true at 100%', () => {
      const flag = makeFlag('PERCENTAGE_ROLLOUT', { percentage: 100 });
      for (let i = 0; i < 50; i += 1) {
        expect(evaluate(flag, { userId: i }).enabled).toBe(true);
      }
    });

    it('always returns false at 0%', () => {
      const flag = makeFlag('PERCENTAGE_ROLLOUT', { percentage: 0 });
      for (let i = 0; i < 50; i += 1) {
        expect(evaluate(flag, { userId: i }).enabled).toBe(false);
      }
    });

    it('returns no_user when context has no userId', () => {
      const flag = makeFlag('PERCENTAGE_ROLLOUT', { percentage: 50 });
      expect(evaluate(flag, {})).toEqual({ enabled: false, reason: 'no_user' });
    });

    it('treats null percentage as 0', () => {
      const flag = makeFlag('PERCENTAGE_ROLLOUT', { percentage: null });
      expect(evaluate(flag, { userId: 1 }).enabled).toBe(false);
    });
  });

  describe('COHORT_TARGETED', () => {
    it('returns true when cohort is in flag.cohorts', () => {
      const flag = makeFlag('COHORT_TARGETED', { cohorts: ['blue', 'green'] });
      expect(evaluate(flag, { cohort: 'blue' })).toEqual({ enabled: true, reason: 'cohort_match' });
    });

    it('returns false when cohort is not in flag.cohorts', () => {
      const flag = makeFlag('COHORT_TARGETED', { cohorts: ['blue'] });
      expect(evaluate(flag, { cohort: 'red' })).toEqual({ enabled: false, reason: 'cohort_match' });
    });

    it('returns no_cohort when context has no cohort', () => {
      const flag = makeFlag('COHORT_TARGETED', { cohorts: ['blue'] });
      expect(evaluate(flag, {})).toEqual({ enabled: false, reason: 'no_cohort' });
    });
  });
});
