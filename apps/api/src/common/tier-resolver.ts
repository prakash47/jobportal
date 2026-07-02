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
  return highestTier(subs);
}

// Recruiter variant (feature/recruiter-billing): recruiter subscriptions are
// COMPANY-scoped — a plan bought by any owner/admin entitles the whole team —
// so the effective tier is the best of the user's own subscriptions and the
// company's. Falls back to plain user resolution when the caller has no
// Recruiter row (defensive; RolesGuard should prevent that).
export async function resolveRecruiterTier(userId: number): Promise<SubscriptionTier> {
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId },
    select: { companyId: true },
  });
  if (!recruiter) return resolveUserTier(userId);
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: PAID_IN_PERIOD_STATUSES },
      currentPeriodEnd: { gt: new Date() },
      OR: [{ userId }, { companyId: recruiter.companyId }],
    },
    select: { plan: { select: { tier: true } } },
  });
  return highestTier(subs);
}

function highestTier(subs: Array<{ plan: { tier: SubscriptionTier } }>): SubscriptionTier {
  let best: SubscriptionTier = 'FREE';
  for (const s of subs) {
    if (TIER_RANK[s.plan.tier] > TIER_RANK[best]) best = s.plan.tier;
  }
  return best;
}
