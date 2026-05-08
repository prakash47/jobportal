import type { PrismaClient } from '../../generated/client';

// Per SRS §7.8 + CLAUDE.md §4 — every flag ships enabled: false on Day 0.
// 26 flags exact (matches SRS §7.8 "26+ feature flags").

type FlagSeed = {
  key: string;
  type: 'BOOLEAN' | 'TIER_GATED' | 'PERCENTAGE_ROLLOUT' | 'USER_TARGETED' | 'COHORT_TARGETED';
  category: 'services' | 'subscription' | 'features' | 'recruiter' | 'experiments' | 'killswitch';
  uiLabel: string;
  description?: string;
};

const flags: FlagSeed[] = [
  // Services menu
  { key: 'services.menu.visible', type: 'BOOLEAN', category: 'services', uiLabel: 'Show "Services" link in nav' },
  { key: 'services.resume_display.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Resume Display service' },
  { key: 'services.resume_writing.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Resume Writing service' },
  { key: 'services.resume_writing_executive.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Resume Writing — Executive' },
  { key: 'services.ai_interview.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'AI Interview service' },
  { key: 'services.priority_applicant.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Priority Applicant service' },
  { key: 'services.profile_spotlight.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Profile Spotlight service' },
  { key: 'services.recruiter_connect.enabled', type: 'BOOLEAN', category: 'services', uiLabel: 'Recruiter Connect service' },

  // Subscription system
  { key: 'subscription.system.enabled', type: 'BOOLEAN', category: 'subscription', uiLabel: 'Master switch — billing system' },
  { key: 'subscription.pricing_page.visible', type: 'BOOLEAN', category: 'subscription', uiLabel: 'Show /pricing page' },
  { key: 'subscription.plans.basic.enabled', type: 'BOOLEAN', category: 'subscription', uiLabel: 'Basic plan sellable' },
  { key: 'subscription.plans.premium.enabled', type: 'BOOLEAN', category: 'subscription', uiLabel: 'Premium plan sellable' },
  { key: 'subscription.plans.enterprise.enabled', type: 'BOOLEAN', category: 'subscription', uiLabel: 'Enterprise plan sellable' },

  // Tier-gated features
  { key: 'feature.unlimited_applications', type: 'TIER_GATED', category: 'features', uiLabel: 'Unlimited job applications' },
  { key: 'feature.profile_views_insights', type: 'TIER_GATED', category: 'features', uiLabel: 'Who viewed your profile' },
  { key: 'feature.salary_insights', type: 'TIER_GATED', category: 'features', uiLabel: 'Salary insights' },
  { key: 'feature.resume_download_pdf', type: 'TIER_GATED', category: 'features', uiLabel: 'Download resume as PDF' },
  { key: 'feature.bulk_apply', type: 'TIER_GATED', category: 'features', uiLabel: 'Bulk apply (max 25 jobs)' },
  { key: 'feature.ai_resume_review', type: 'TIER_GATED', category: 'features', uiLabel: 'AI resume review' },

  // Recruiter
  { key: 'recruiter.resdex.enabled', type: 'BOOLEAN', category: 'recruiter', uiLabel: 'ResDex candidate search' },
  { key: 'recruiter.bulk_messaging.enabled', type: 'BOOLEAN', category: 'recruiter', uiLabel: 'Bulk recruiter messaging' },
  { key: 'feature.recruiter_post_quota', type: 'TIER_GATED', category: 'recruiter', uiLabel: 'Lift recruiter post quota for paid tiers' },

  // Moderation
  { key: 'moderation.jobs.enabled', type: 'BOOLEAN', category: 'moderation', uiLabel: 'Route new jobs through admin moderation' },

  // Experiments
  { key: 'experiment.new_homepage', type: 'COHORT_TARGETED', category: 'experiments', uiLabel: 'New homepage A/B test' },
  { key: 'experiment.ai_job_match', type: 'PERCENTAGE_ROLLOUT', category: 'experiments', uiLabel: 'AI job match rollout' },

  // Killswitches
  { key: 'killswitch.job_alerts', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable job alerts (kill)' },
  { key: 'killswitch.resume_uploads', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable resume uploads (kill)' },
  { key: 'killswitch.new_registrations', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable new user registrations (kill)' },
];

export async function seedFlags(prisma: PrismaClient): Promise<void> {
  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {}, // never overwrite an admin-toggled flag during reseed
      create: {
        key: flag.key,
        type: flag.type,
        category: flag.category,
        uiLabel: flag.uiLabel,
        description: flag.description ?? null,
        enabled: false,
        percentage: flag.type === 'PERCENTAGE_ROLLOUT' ? 0 : null,
        targetUserIds: [],
        requiredTiers: [],
        cohorts: [],
      },
    });
  }
  console.log(`  -> ${flags.length} flags upserted (all enabled: false)`);
}
