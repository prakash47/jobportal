// Shared tier resolver — promoted out of ApplicationQuotaService when
// RecruiterPostQuotaService needed the same logic. Both quotas key off the
// user's effective subscription tier, returning FREE when no row holds.

import { prisma, type SubscriptionStatus, type SubscriptionTier } from '@jobportal/db';

const PAID_IN_PERIOD_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING'];

const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  ENTERPRISE: 3,
};

// Resolves the user's effective tier. PAST_DUE is intentionally excluded
// (period has lapsed). Multiple non-terminal subscriptions (defensive) →
// pick the highest tier.
export async function resolveUserTier(userId: number): Promise<SubscriptionTier> {
  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: PAID_IN_PERIOD_STATUSES },
      currentPeriodEnd: { gt: new Date() },
    },
    select: { plan: { select: { tier: true } } },
  });
  if (subs.length === 0) return 'FREE';
  let best: SubscriptionTier = 'FREE';
  for (const s of subs) {
    if (TIER_RANK[s.plan.tier] > TIER_RANK[best]) best = s.plan.tier;
  }
  return best;
}
