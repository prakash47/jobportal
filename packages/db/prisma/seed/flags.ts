import type { PrismaClient } from '../../generated/client';

// Per SRS §7.8 + CLAUDE.md §4 — every PAID feature ships enabled: false on
// Day 0. (SRS §7.8 specifies "26+ feature flags"; the list has grown well past
// that as killswitches accumulated — no test asserts the count.)
//
// `enabled` defaults to false and is only set explicitly for flags that gate
// a FREE surface's visibility (not a paid capability) — see
// recruiter.plans_visible below.

type FlagSeed = {
  key: string;
  type: 'BOOLEAN' | 'TIER_GATED' | 'PERCENTAGE_ROLLOUT' | 'USER_TARGETED' | 'COHORT_TARGETED';
  category: 'services' | 'subscription' | 'features' | 'recruiter' | 'experiments' | 'killswitch';
  uiLabel: string;
  description?: string;
  /** Defaults to false. Only set true for free/visibility flags. */
  enabled?: boolean;
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
  // Premium job-posting products (Post a Job → job-type selector). Paid, so
  // seeded OFF per CLAUDE.md §0: the Hot Vacancy / SMB Pack cards render locked
  // ("upgrade") until an admin flips these ON. Free Job + Internship are always
  // available (no flag).
  { key: 'recruiter.hot_vacancy.enabled', type: 'BOOLEAN', category: 'recruiter', uiLabel: 'Sell Hot Vacancy premium job posts' },
  { key: 'recruiter.smb_pack.enabled', type: 'BOOLEAN', category: 'recruiter', uiLabel: 'Sell SMB Pack job posts' },
  // Recruiter "Billing" nav group + /plans and /billing pages. Seeded ON: every
  // recruiter can see the plan catalogue and their own (Free) plan state from
  // day one. This is a VISIBILITY flag, not a paid capability — purchasing is
  // still gated by subscription.system.enabled (seeded OFF), so every buy CTA
  // renders disabled and the API rejects orders. Flip this OFF to hide the
  // whole surface again without a redeploy.
  { key: 'recruiter.plans_visible', type: 'BOOLEAN', category: 'recruiter', uiLabel: 'Show recruiter Plans & Billing pages', enabled: true },

  // Moderation
  { key: 'moderation.jobs.enabled', type: 'BOOLEAN', category: 'moderation', uiLabel: 'Route new jobs through admin moderation' },

  // Experiments
  { key: 'experiment.new_homepage', type: 'COHORT_TARGETED', category: 'experiments', uiLabel: 'New homepage A/B test' },
  { key: 'experiment.ai_job_match', type: 'PERCENTAGE_ROLLOUT', category: 'experiments', uiLabel: 'AI job match rollout' },

  // Killswitches
  { key: 'killswitch.job_alerts', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable job alerts (kill)' },
  { key: 'killswitch.resume_uploads', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable resume uploads (kill)' },
  { key: 'killswitch.new_registrations', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable new user registrations (kill)' },
  // SRS §4.13 — emergency stop for the transactional-email pipeline. Flips
  // the worker into a no-op (jobs ack but don't send) and the API rejects
  // user-triggered resends. Job-alert digests are gated separately by
  // killswitch.job_alerts so support can pause one without the other.
  { key: 'killswitch.transactional_emails', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable all transactional emails (kill)' },
  // Phase 1 item 18 — emergency stop for telemetry capture (Sentry +
  // PostHog). Flips the SDK beforeSend callback into a `return null` so
  // events stop leaving the process. SDK init still runs (cheap, not
  // gated) so flipping back ON is instant — no redeploy needed.
  { key: 'killswitch.telemetry', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable Sentry + PostHog telemetry (kill)' },
  // Recruiter Company Verification (KYC) — emergency stop for the whole KYC
  // flow (submission + document upload + admin review actions). Seeded OFF so
  // the feature is LIVE by default; flipping it ON disables it without a
  // redeploy. Enforced at the API (L3) and the recruiter /kyc page (L2).
  { key: 'killswitch.recruiter_kyc', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter company verification / KYC (kill)' },
  // Recruiter notifications (the top-bar bell + the "Notification settings" tab).
  // Emergency stop for the whole feature: producers stop writing notification
  // rows, the bell is hidden, the settings page 404s, and preference mutations
  // reject. Seeded OFF so the feature is LIVE by default; flipping it ON disables
  // it without a redeploy. Enforced at the API (L3) and the recruiter shell (L2).
  { key: 'killswitch.recruiter_notifications', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter notifications + settings (kill)' },
  // Recruiter self-service password change (Settings → Change Password).
  // Emergency stop: when ON the /settings/change-password page 404s (L2) and the
  // POST /auth/recruiter/change-password endpoint rejects with 503 (L3). Seeded
  // OFF so the feature is LIVE by default; flipping it ON disables it without a
  // redeploy.
  { key: 'killswitch.recruiter_change_password', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter password change (kill)' },
  // Recruiter Team / User management (SRS §4.9 — the "Users" panel: invite
  // teammates, edit in-company roles, set per-module permissions, remove users).
  // Emergency stop: when ON the /users + /accept-invite pages 404 (L2) and every
  // /recruiter/users mutation + the invite email producer reject with 503 (L3).
  // Seeded OFF so the feature is LIVE by default; flipping it ON disables it
  // without a redeploy.
  { key: 'killswitch.recruiter_user_management', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter user/team management (kill)' },
  // Recruiter Help & Support (searchable FAQ + Contact Us + Raise a Ticket).
  // Emergency stop: when ON the recruiter /support/* pages 404 (L2) and every
  // /recruiter/support mutation rejects with 503 (L3); the admin /admin/support
  // console stays up so staff can keep working existing tickets. Seeded OFF so
  // the feature is LIVE by default; flipping it ON disables it without a
  // redeploy.
  { key: 'killswitch.recruiter_help_support', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter help & support (kill)' },
  // Recruiter "Post a Job" flow (the /post-job page + POST /recruiter/jobs).
  // Emergency stop: when ON the /post-job page 404s (L2) and the create
  // endpoint rejects with 503 (L3); job management (edit/close/reopen) stays
  // up. Seeded OFF so the feature is LIVE by default; flipping it ON disables
  // posting without a redeploy.
  { key: 'killswitch.recruiter_post_job', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter job posting (kill)' },
  // Recruiter job deletion (Jobs list → 3-dot menu → Delete). Deletion is
  // already restricted to own jobs with zero applications; this kill switch
  // stops even that: when ON the DELETE endpoint rejects with 503 (L3) and the
  // menu hides Delete (L2). Seeded OFF so the action is LIVE by default.
  { key: 'killswitch.recruiter_job_delete', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter job deletion (kill)' },
  // Recruiter Job Detail "Collaborate" (owner adds teammates to a job so they can
  // help manage/respond). Emergency stop for granting new access: when ON the
  // POST/DELETE /recruiter/jobs/:id/collaborators endpoints reject with 503 (L3)
  // and the Job Detail page hides the Collaborate control (L2); existing
  // collaborators keep their access. Seeded OFF so the feature is LIVE by default.
  { key: 'killswitch.recruiter_job_collaborate', type: 'BOOLEAN', category: 'killswitch', uiLabel: 'Disable recruiter job collaboration (kill)' },
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
        enabled: flag.enabled ?? false,
        percentage: flag.type === 'PERCENTAGE_ROLLOUT' ? 0 : null,
        targetUserIds: [],
        requiredTiers: [],
        cohorts: [],
      },
    });
  }
  const onByDefault = flags.filter((f) => f.enabled).length;
  console.log(
    `  -> ${flags.length} flags upserted (${flags.length - onByDefault} enabled: false, ${onByDefault} enabled: true)`,
  );
}
