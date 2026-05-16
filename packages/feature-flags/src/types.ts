import type { FeatureFlag, FlagAuditLog, SubscriptionTier } from '@jobportal/db';

export type { FeatureFlag, FlagAuditLog };

export type EvaluationContext = {
  userId?: number;
  tier?: SubscriptionTier;
  cohort?: string;
};

export type EvaluationResult = {
  enabled: boolean;
  reason: EvaluationReason;
};

export type EvaluationReason =
  | 'admin_grant'
  | 'flag_off'
  | 'flag_on'
  | 'user_targeted'
  | 'tier_match'
  | 'percentage_in'
  | 'cohort_match'
  | 'no_user'
  | 'no_tier'
  | 'no_cohort';

// `| undefined` is explicit on every field so callers can pass parsed
// values (e.g. from Zod's safeParse result) directly. Without it,
// exactOptionalPropertyTypes rejects the call.
export type FlagPatch = {
  enabled?: boolean | undefined;
  percentage?: number | null | undefined;
  targetUserIds?: number[] | undefined;
  requiredTiers?: SubscriptionTier[] | undefined;
  cohorts?: string[] | undefined;
};

export type Actor = {
  userId: number;
  email?: string;
  // Optional today, but setFlag asserts role === 'ADMIN' before writing.
  // The admin controller is the only sanctioned caller and now passes
  // 'ADMIN' explicitly; older callers that handed in a bare {userId}
  // start failing the assertion, which is the point of the check.
  role?: 'ADMIN';
};
