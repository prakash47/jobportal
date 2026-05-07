// All 26 flag keys from SRS §7.8. Constants for type-safe consumer code.

export const FLAG = {
  // Services menu
  SERVICES_MENU_VISIBLE: 'services.menu.visible',
  SERVICES_RESUME_DISPLAY: 'services.resume_display.enabled',
  SERVICES_RESUME_WRITING: 'services.resume_writing.enabled',
  SERVICES_RESUME_WRITING_EXECUTIVE: 'services.resume_writing_executive.enabled',
  SERVICES_AI_INTERVIEW: 'services.ai_interview.enabled',
  SERVICES_PRIORITY_APPLICANT: 'services.priority_applicant.enabled',
  SERVICES_PROFILE_SPOTLIGHT: 'services.profile_spotlight.enabled',
  SERVICES_RECRUITER_CONNECT: 'services.recruiter_connect.enabled',

  // Subscription
  SUBSCRIPTION_SYSTEM: 'subscription.system.enabled',
  PRICING_PAGE_VISIBLE: 'subscription.pricing_page.visible',
  PLAN_BASIC: 'subscription.plans.basic.enabled',
  PLAN_PREMIUM: 'subscription.plans.premium.enabled',
  PLAN_ENTERPRISE: 'subscription.plans.enterprise.enabled',

  // Tier-gated features
  FEAT_UNLIMITED_APPLICATIONS: 'feature.unlimited_applications',
  FEAT_PROFILE_VIEWS_INSIGHTS: 'feature.profile_views_insights',
  FEAT_SALARY_INSIGHTS: 'feature.salary_insights',
  FEAT_RESUME_DOWNLOAD_PDF: 'feature.resume_download_pdf',
  FEAT_BULK_APPLY: 'feature.bulk_apply',
  FEAT_AI_RESUME_REVIEW: 'feature.ai_resume_review',

  // Recruiter
  RECRUITER_RESDEX: 'recruiter.resdex.enabled',
  RECRUITER_BULK_MESSAGING: 'recruiter.bulk_messaging.enabled',

  // Experiments
  EXP_NEW_HOMEPAGE: 'experiment.new_homepage',
  EXP_AI_JOB_MATCH: 'experiment.ai_job_match',

  // Killswitches
  KILL_JOB_ALERTS: 'killswitch.job_alerts',
  KILL_RESUME_UPLOADS: 'killswitch.resume_uploads',
  KILL_NEW_REGISTRATIONS: 'killswitch.new_registrations',
} as const;

export type FlagKey = (typeof FLAG)[keyof typeof FLAG];

// Flags whose toggle should fire a Slack notification (SRS §7.13).
export const CRITICAL_FLAGS: ReadonlyArray<FlagKey> = [
  FLAG.SERVICES_MENU_VISIBLE,
  FLAG.SUBSCRIPTION_SYSTEM,
  FLAG.KILL_JOB_ALERTS,
  FLAG.KILL_RESUME_UPLOADS,
  FLAG.KILL_NEW_REGISTRATIONS,
];
