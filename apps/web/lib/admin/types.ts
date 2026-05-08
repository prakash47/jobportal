// Shared shapes between the /admin/feature-flags server entry and the
// client components. Mirrors the API's FeatureFlag row but kept here
// (rather than imported from @jobportal/feature-flags) so the web bundle
// doesn't drag in the package's runtime — Prisma client + ioredis are
// not things we want shipped to the browser.

export type FlagType =
  | 'BOOLEAN'
  | 'TIER_GATED'
  | 'PERCENTAGE_ROLLOUT'
  | 'USER_TARGETED'
  | 'COHORT_TARGETED';

export type SubscriptionTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';

export interface AdminFeatureFlag {
  id: number;
  key: string;
  description: string | null;
  uiLabel: string | null;
  category: string | null;
  type: FlagType;
  enabled: boolean;
  percentage: number | null;
  targetUserIds: number[];
  requiredTiers: SubscriptionTier[];
  cohorts: string[];
  createdAt: string;
  updatedAt: string;
}

// Matches packages/feature-flags/src/keys.ts CRITICAL_FLAGS exactly. Kept
// in sync by hand because importing from the package would pull Prisma
// runtime into the web bundle. The /admin/feature-flags table renders a
// confirmation modal whenever a flag in this list is toggled.
export const CRITICAL_FLAG_PREFIXES = ['killswitch.'] as const;
export const CRITICAL_FLAG_KEYS: readonly string[] = [
  'services.menu.visible',
  'subscription.system.enabled',
];

export function isCriticalFlag(key: string): boolean {
  if (CRITICAL_FLAG_KEYS.includes(key)) return true;
  return CRITICAL_FLAG_PREFIXES.some((p) => key.startsWith(p));
}

export const CATEGORY_ORDER: readonly string[] = [
  'services',
  'subscription',
  'features',
  'recruiter',
  'experiments',
  'killswitch',
  'moderation',
];

export const CATEGORY_LABEL: Record<string, string> = {
  services: 'Services',
  subscription: 'Subscription',
  features: 'Features',
  recruiter: 'Recruiter',
  experiments: 'Experiments',
  killswitch: 'Killswitches',
  moderation: 'Moderation',
};
