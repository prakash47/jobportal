import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../lib/auth/require-recruiter';
import { PlansPanel, type PlanCardData } from '../../../components/billing/PlansPanel';

// SRS §4.11 / §7 — recruiter Plans & Pricing. Reads (plan catalogue, current
// subscription, billing profile) direct via Prisma (reads/writes split);
// order creation + payment verification go through the BFF. L2 of the paid
// gate lives here (404 while subscription.system.enabled is OFF); L1 is the
// recruiter middleware; L3 (the trusted boundary) is the API.

export const dynamic = 'force-dynamic';

// Human copy for the feature-flag keys a plan carries; unknown keys are
// simply not rendered as bullets.
const FEATURE_LABELS: Record<string, string> = {
  'feature.recruiter_post_quota': 'Unlimited job posts',
  'recruiter.resdex.enabled': 'ResDex candidate database',
  'recruiter.bulk_messaging.enabled': 'Bulk candidate messaging',
};

export default async function PlansPage() {
  if (!(await isFlagEnabled(FLAG.SUBSCRIPTION_SYSTEM))) notFound();
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
      orderBy: { sortOrder: 'asc' },
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

  // Per-tier launch flags (subscription.plans.<tier>.enabled, seeded OFF) — a
  // plan card renders only once the admin launches its tier. The API re-checks
  // at purchase time.
  const tierEnabled = await Promise.all(
    planRows.map((p) => isFlagEnabled(`subscription.plans.${p.tier.toLowerCase()}.enabled`)),
  );
  const plans: PlanCardData[] = planRows
    .filter((_, i) => tierEnabled[i] === true)
    .map((p) => ({
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
    }));

  const canManage = caller.companyRole === 'OWNER' || caller.companyRole === 'ADMIN';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Plans &amp; pricing
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Prepaid plans that cover your whole team — pay once, use for the full period, renew when
          it suits you. No auto-debit.
        </p>
      </header>

      {plans.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-fg-muted)]">
          Plans aren&rsquo;t available for purchase yet. Check back soon.
        </div>
      ) : (
        <PlansPanel
          plans={plans}
          currentPlanId={subscription?.planId ?? null}
          canManage={canManage}
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
      )}
    </div>
  );
}
