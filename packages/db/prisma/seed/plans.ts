import type { PrismaClient } from '../../generated/client';

// Per SRS §7.8 + CLAUDE.md §4 — all plans ship isActive: false, isPublic: false.
// Pricing values are placeholders the admin will tune before activation.
//
// audience: CANDIDATE plans belong to the apps/web storefront; RECRUITER plans
// are listed on the recruiter portal's /plans page. Note the seed upsert uses
// `update: {}` (never mutates existing rows) — audience changes to
// already-seeded databases are handled by migration backfills, not the seed
// (see 20260702135653_add_recruiter_billing).

type PlanSeed = {
  slug: string;
  name: string;
  description: string;
  tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
  audience: 'CANDIDATE' | 'RECRUITER';
  priceInPaise: number;
  intervalDays: number;
  trialDays?: number;
  featureKeys: string[];
  sortOrder: number;
};

const plans: PlanSeed[] = [
  {
    slug: 'basic-monthly',
    name: 'Basic',
    description: 'Unlimited applications and profile-view insights.',
    tier: 'BASIC',
    audience: 'CANDIDATE',
    priceInPaise: 49900, // INR 499 / month
    intervalDays: 30,
    trialDays: 7,
    featureKeys: ['feature.unlimited_applications', 'feature.profile_views_insights'],
    sortOrder: 1,
  },
  {
    slug: 'premium-monthly',
    name: 'Premium',
    description: 'All paid features included. Billed monthly.',
    tier: 'PREMIUM',
    audience: 'CANDIDATE',
    priceInPaise: 99900, // INR 999 / month
    intervalDays: 30,
    trialDays: 7,
    featureKeys: [
      'feature.unlimited_applications',
      'feature.profile_views_insights',
      'feature.salary_insights',
      'feature.resume_download_pdf',
      'feature.bulk_apply',
      'feature.ai_resume_review',
    ],
    sortOrder: 2,
  },
  {
    slug: 'premium-yearly',
    name: 'Premium (Yearly)',
    description: 'All paid features included. Billed annually — saves about 17%.',
    tier: 'PREMIUM',
    audience: 'CANDIDATE',
    priceInPaise: 999900, // INR 9,999 / year
    intervalDays: 365,
    trialDays: 7,
    featureKeys: [
      'feature.unlimited_applications',
      'feature.profile_views_insights',
      'feature.salary_insights',
      'feature.resume_download_pdf',
      'feature.bulk_apply',
      'feature.ai_resume_review',
    ],
    sortOrder: 3,
  },
  // Recruiter storefront (prepaid fixed-duration plans, no trial — B2B norm).
  // Prices are GST-inclusive placeholders; what each tier unlocks is governed
  // by the TIER_GATED flags' requiredTiers (e.g. feature.recruiter_post_quota),
  // configured by the admin at activation time.
  {
    slug: 'recruiter-starter-monthly',
    name: 'Recruiter Starter',
    description: 'Higher job-posting limits for small hiring teams. Billed monthly.',
    tier: 'BASIC',
    audience: 'RECRUITER',
    priceInPaise: 199900, // INR 1,999 / month (incl. GST)
    intervalDays: 30,
    featureKeys: ['feature.recruiter_post_quota'],
    sortOrder: 4,
  },
  {
    slug: 'recruiter-growth-monthly',
    name: 'Recruiter Growth',
    description: 'Unlimited postings and priority support for growing teams. Billed monthly.',
    tier: 'PREMIUM',
    audience: 'RECRUITER',
    priceInPaise: 499900, // INR 4,999 / month (incl. GST)
    intervalDays: 30,
    featureKeys: ['feature.recruiter_post_quota'],
    sortOrder: 5,
  },
  {
    slug: 'enterprise-yearly',
    name: 'Enterprise',
    description: 'For recruiter teams — ResDex, bulk messaging, dedicated support.',
    tier: 'ENTERPRISE',
    audience: 'RECRUITER',
    priceInPaise: 9999900, // INR 99,999 / year (incl. GST)
    intervalDays: 365,
    trialDays: 14,
    featureKeys: ['recruiter.resdex.enabled', 'recruiter.bulk_messaging.enabled'],
    sortOrder: 6,
  },
];

export async function seedPlans(prisma: PrismaClient): Promise<void> {
  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        tier: plan.tier,
        audience: plan.audience,
        priceInPaise: plan.priceInPaise,
        currency: 'INR',
        intervalDays: plan.intervalDays,
        trialDays: plan.trialDays ?? null,
        featureKeys: plan.featureKeys,
        isActive: false,
        isPublic: false,
        sortOrder: plan.sortOrder,
      },
    });
  }
  console.log(`  -> ${plans.length} plans upserted (all isActive: false, isPublic: false)`);
}
