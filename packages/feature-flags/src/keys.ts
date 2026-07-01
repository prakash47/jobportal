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
  // Recruiter Company Verification (KYC). Emergency stop for the whole KYC flow
  // (submission + document upload). Seeded enabled:false, so the feature is LIVE
  // by default; an admin flipping this ON disables it without a redeploy. Being
  // a `killswitch.*` key it is auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_KYC: 'killswitch.recruiter_kyc',
  // Recruiter notifications (the top-bar bell + the "Notification settings" tab).
  // Emergency stop for the whole feature: when ON, producers stop writing
  // notification rows, the bell is hidden from the recruiter shell (L2), the
  // /notification-settings page 404s (L2), and the preference-mutation endpoints
  // reject (L3). Seeded enabled:false, so the feature is LIVE by default; an
  // admin flipping this ON disables it without a redeploy. As a `killswitch.*`
  // key it is auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_NOTIFICATIONS: 'killswitch.recruiter_notifications',
  // Recruiter self-service password change (Settings → Change Password).
  // Emergency stop for the feature: when ON, the /settings/change-password page
  // 404s (L2) and the POST /auth/recruiter/change-password endpoint rejects with
  // 503 (L3). Seeded enabled:false, so the feature is LIVE by default; an admin
  // flipping this ON disables it without a redeploy. As a `killswitch.*` key it
  // is auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_CHANGE_PASSWORD: 'killswitch.recruiter_change_password',
} as const;

export type FlagKey = (typeof FLAG)[keyof typeof FLAG];

// Flags whose toggle is "critical" for SRS §7.13 (Slack notification) and
// SRS §7.7 (admin UI confirmation modal). Two rules:
//   1. Any key starting with `killswitch.` — by definition, killing
//      something at runtime is always critical.
//   2. Two cross-cutting non-killswitch flags whose toggle reshapes the
//      whole product: services menu visibility and the master
//      subscription switch.
//
// Rule (1) being prefix-based means new killswitch flags inherit critical
// status automatically — important so a future `killswitch.foo` doesn't
// silently bypass the Slack alert and the admin confirmation prompt.
const NON_KILLSWITCH_CRITICAL = new Set<string>([
  FLAG.SERVICES_MENU_VISIBLE,
  FLAG.SUBSCRIPTION_SYSTEM,
]);

export function isCriticalFlag(key: string): boolean {
  if (key.startsWith('killswitch.')) return true;
  return NON_KILLSWITCH_CRITICAL.has(key);
}

// Kept for back-compat where consumers import the array form. Resolved
// at module load against the current FLAG keys; future flags added to
// FLAG that should be critical will need to land via isCriticalFlag()
// (which is the source of truth).
export const CRITICAL_FLAGS: ReadonlyArray<FlagKey> = (
  Object.values(FLAG) as FlagKey[]
).filter(isCriticalFlag);
