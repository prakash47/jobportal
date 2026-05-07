import type { PrismaClient } from '../../generated/client';

// Per SRS §7.8 + CLAUDE.md §4 — all plans ship isActive: false, isPublic: false.
// Pricing values are placeholders the admin will tune before activation.

type PlanSeed = {
  slug: string;
  name: string;
  description: string;
  tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
  priceInPaise: number;
  intervalDays: number;
  trialDays: number;
  featureKeys: string[];
  sortOrder: number;
};

const plans: PlanSeed[] = [
  {
    slug: 'basic-monthly',
    name: 'Basic',
    description: 'Unlimited applications and profile-view insights.',
    tier: 'BASIC',
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
  {
    slug: 'enterprise-yearly',
    name: 'Enterprise',
    description: 'For recruiter teams — ResDex, bulk messaging, dedicated support.',
    tier: 'ENTERPRISE',
    priceInPaise: 9999900, // INR 99,999 / year
    intervalDays: 365,
    trialDays: 14,
    featureKeys: ['recruiter.resdex.enabled', 'recruiter.bulk_messaging.enabled'],
    sortOrder: 4,
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
        priceInPaise: plan.priceInPaise,
        currency: 'INR',
        intervalDays: plan.intervalDays,
        trialDays: plan.trialDays,
        featureKeys: plan.featureKeys,
        isActive: false,
        isPublic: false,
        sortOrder: plan.sortOrder,
      },
    });
  }
  console.log(`  -> ${plans.length} plans upserted (all isActive: false, isPublic: false)`);
}
