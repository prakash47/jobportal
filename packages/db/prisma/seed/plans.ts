import type { PrismaClient } from '../../generated/client';

// Per SRS §7.8 + CLAUDE.md §4 — CANDIDATE plans ship isActive: false,
// isPublic: false (the apps/web storefront is dark on Day 0). RECRUITER plans
// ship LISTED, because the recruiter /plans catalogue is visible to everyone;
// they are still not PURCHASABLE (subscription.system.enabled is seeded OFF and
// the API rejects every order). Pricing values are placeholders the admin will
// tune before activation — the plans page labels them a preview.
//
// The upsert is no-clobber for CANDIDATE rows; for RECRUITER rows it re-syncs
// name + description only (that copy is now user-facing, so it must not go
// stale), never price/flags/listing state. Audience changes to already-seeded
// databases are handled by migration backfills, not the seed
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
    // NOT "unlimited postings": whether a tier is actually unlimited is set by
    // the admin on feature.recruiter_post_quota's requiredTiers, which this copy
    // can't know — the same reason the plans page labels the bullet "Higher
    // job-posting limits". Also no "priority support" claim: the support module
    // has no tier awareness (one queue, no priority concept).
    description: 'More job-posting headroom for growing hiring teams. Billed monthly.',
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
    // ResDex + bulk messaging are UNBUILT — they exist only as flag keys and
    // these seed strings; there is no route, controller or service for either.
    // Now that this catalogue is visible to every recruiter the copy must not
    // sell them as included, so it describes the tier without naming
    // capabilities that don't exist yet. (The featureKeys below still drive the
    // bullet list; they'll read as real once the features ship.)
    description: 'For large recruiting teams with company-wide hiring needs. Billed yearly.',
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
    const listed = plan.audience === 'RECRUITER';
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      // RECRUITER copy is now user-visible on the always-on /plans catalogue, so
      // name/description must track the seed — an existing dev DB would
      // otherwise keep stale marketing text (this is how the "unlimited
      // postings" / ResDex claims would have survived their correction).
      // Pricing, flags and listing state are NOT re-synced: those are
      // admin-owned at runtime. CANDIDATE rows stay fully no-clobber.
      update: listed ? { name: plan.name, description: plan.description } : {},
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
        // RECRUITER plans ship LISTED so the always-visible catalogue can render
        // them with real pricing. Listed is NOT purchasable: buying is gated by
        // subscription.system.enabled (seeded OFF) + the per-tier
        // subscription.plans.<tier>.enabled keys, and the API's
        // assertBillingEnabled rejects every order while the master flag is off.
        // CANDIDATE plans stay dark — apps/web's storefront is off per CLAUDE.md §0.
        isActive: listed,
        isPublic: listed,
        sortOrder: plan.sortOrder,
      },
    });
  }

  // One-time backfill for DBs seeded BEFORE recruiter plans became listed.
  // Deliberately narrow: it only touches rows still in the old default
  // (isActive AND isPublic both false), so an admin who intentionally delists a
  // plan keeps it delisted across reseeds — mirroring the flags seed's
  // "never overwrite an admin-toggled value" rule.
  const listed = await prisma.subscriptionPlan.updateMany({
    where: { audience: 'RECRUITER', isActive: false, isPublic: false },
    data: { isActive: true, isPublic: true },
  });

  console.log(
    `  -> ${plans.length} plans upserted; ${listed.count} legacy RECRUITER plans backfilled to listed (still not purchasable)`,
  );
}
