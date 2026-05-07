import type { EvaluationContext, EvaluationResult, FeatureFlag } from './types';
import { bucket } from './hash';

// Pure evaluator per SRS §7.5. No I/O, no side effects.
//
// Admin grant precedence (SRS §7.5 step 1) is checked separately in api.ts
// BEFORE this function is called — that path bypasses the flag entirely.
// This module is the "step 2 onwards" portion: given the loaded flag and the
// caller's context, decide whether to enable.

export function evaluate(flag: FeatureFlag | null, ctx: EvaluationContext): EvaluationResult {
  if (!flag || !flag.enabled) {
    return { enabled: false, reason: 'flag_off' };
  }

  switch (flag.type) {
    case 'BOOLEAN':
      return { enabled: true, reason: 'flag_on' };

    case 'USER_TARGETED': {
      if (ctx.userId === undefined) return { enabled: false, reason: 'no_user' };
      return {
        enabled: flag.targetUserIds.includes(ctx.userId),
        reason: 'user_targeted',
      };
    }

    case 'TIER_GATED': {
      if (ctx.tier === undefined) return { enabled: false, reason: 'no_tier' };
      return {
        enabled: flag.requiredTiers.includes(ctx.tier),
        reason: 'tier_match',
      };
    }

    case 'PERCENTAGE_ROLLOUT': {
      if (ctx.userId === undefined) return { enabled: false, reason: 'no_user' };
      const pct = flag.percentage ?? 0;
      return {
        enabled: bucket(ctx.userId, flag.key) < pct,
        reason: 'percentage_in',
      };
    }

    case 'COHORT_TARGETED': {
      if (ctx.cohort === undefined) return { enabled: false, reason: 'no_cohort' };
      return {
        enabled: flag.cohorts.includes(ctx.cohort),
        reason: 'cohort_match',
      };
    }
  }
}
