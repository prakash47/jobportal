import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../lib/auth/require-recruiter';
import { PlansPanel, type PlanCardData } from '../../../components/billing/PlansPanel';

// SRS §4.11 / §7 — recruiter Plans & Pricing. Reads (plan catalogue, current
// subscription, billing profile) direct via Prisma (reads/writes split);
// order creation + payment verification go through the BFF.
//
// Two independent gates:
//   • VISIBILITY — recruiter.plans_visible (seeded ON). L1 recruiter
//     middleware, L2 the notFound() below. Every recruiter can review the
//     catalogue and their own Free-plan state.
//   • PURCHASABILITY — subscription.system.enabled (seeded OFF) plus the
//     per-tier subscription.plans.<tier>.enabled keys. These no longer hide
//     cards; they disable the CTA. L3 (the trusted boundary) is the API, which
//     re-checks both before creating any order.

export const dynamic = 'force-dynamic';

// Human copy for the feature-flag keys a plan carries; unknown keys are
// simply not rendered as bullets. NOTE: the post-quota label is deliberately
// "Higher job-posting limits" (accurate for every tier that carries the key) —
// whether a given tier is actually UNLIMITED is set by the admin on the
// TIER_GATED flag's requiredTiers, which the label can't know, so it must not
// promise "unlimited" on, e.g., the Starter card.
const FEATURE_LABELS: Record<string, string> = {
  'feature.recruiter_post_quota': 'Higher job-posting limits',
  'recruiter.resdex.enabled': 'ResDex candidate database',
  'recruiter.bulk_messaging.enabled': 'Bulk candidate messaging',
};

export default async function PlansPage() {
  if (!(await isFlagEnabled(FLAG.RECRUITER_PLANS_VISIBLE))) notFound();
  const user = await requireRecruiter();

  const caller = await prisma.recruiter.findUnique({
    where: { userId: user.sub },
    select: { id: true, companyId: true, companyRole: true, deactivatedAt: true },
  });
  if (!caller || caller.deactivatedAt) notFound();

  const now = new Date();
  const [planRows, subscription, profile, kyc] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { audience: 'RECRUITER', isActive: true, isPublic: true },
      // Price tiebreaker so card order is deterministic even if two plans share
      // a sortOrder (e.g. a pre-branch DB where enterprise-yearly wasn't
      // renumbered by the seed's update:{}); the migration also backfills it.
      orderBy: [{ sortOrder: 'asc' }, { priceInPaise: 'asc' }],
    }),
    prisma.subscription.findFirst({
      where: {
        companyId: caller.companyId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gt: now },
        plan: { audience: 'RECRUITER' },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { planId: true },
    }),
    prisma.companyBillingProfile.findUnique({ where: { companyId: caller.companyId } }),
    prisma.companyKyc.findUnique({
      where: { companyId: caller.companyId },
      select: { legalName: true, gstNumber: true },
    }),
  ]);

  // Purchasability, resolved per card. The master switch decides whether ANY
  // plan can be bought; the per-tier launch flag decides whether THIS tier is
  // open yet. Previously these filtered cards out of the list entirely — they
  // now only disable the CTA, so a recruiter can always see what each plan
  // costs. The API re-checks both at purchase time (the trusted boundary).
  const [purchaseEnabled, ...tierEnabled] = await Promise.all([
    isFlagEnabled(FLAG.SUBSCRIPTION_SYSTEM),
    ...planRows.map((p) => isFlagEnabled(`subscription.plans.${p.tier.toLowerCase()}.enabled`)),
  ]);

  const plans: PlanCardData[] = planRows.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceInPaise: p.priceInPaise,
    intervalDays: p.intervalDays,
    tier: p.tier,
    features: p.featureKeys
      .map((key) => FEATURE_LABELS[key])
      .filter((label): label is string => Boolean(label)),
    purchasable: purchaseEnabled && tierEnabled[i] === true,
  }));

  const canManage = caller.companyRole === 'OWNER' || caller.companyRole === 'ADMIN';

  return (
    // data-wide → the authed layout widens the content column to max-w-6xl (see
    // (authed)/layout.tsx). Needed because the catalogue is now four cards —
    // the Free plan plus three paid tiers — and at the default max-w-3xl they
    // would squeeze to ~165px each or strand Enterprise alone on a second row.
    <div data-wide className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Plans &amp; pricing
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Prepaid plans that cover your whole team — pay once, use for the full period, renew when
          it suits you. No auto-debit.
        </p>
      </header>

      {/* Always rendered — PlansPanel leads with the synthetic Free card, so
          even with zero paid plans in the catalogue a recruiter sees their
          current plan rather than a bare empty state. */}
      <PlansPanel
        plans={plans}
        currentPlanId={subscription?.planId ?? null}
        canManage={canManage}
        purchaseEnabled={purchaseEnabled}
        hasProfile={profile !== null}
        profile={
          profile
            ? {
                legalName: profile.legalName,
                gstin: profile.gstin,
                addressLine1: profile.addressLine1,
                addressLine2: profile.addressLine2,
                city: profile.city,
                state: profile.state,
                pincode: profile.pincode,
                billingEmail: profile.billingEmail,
              }
            : null
        }
        kycPrefill={kyc ? { legalName: kyc.legalName, gstin: kyc.gstNumber } : null}
      />
    </div>
  );
}
