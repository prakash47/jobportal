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

export type FlagPatch = Partial<{
  enabled: boolean;
  percentage: number | null;
  targetUserIds: number[];
  requiredTiers: SubscriptionTier[];
  cohorts: string[];
}>;

export type Actor = {
  userId: number;
  email?: string;
  // Optional today, but setFlag asserts role === 'ADMIN' before writing.
  // The admin controller is the only sanctioned caller and now passes
  // 'ADMIN' explicitly; older callers that handed in a bare {userId}
  // start failing the assertion, which is the point of the check.
  role?: 'ADMIN';
};
