// Flag keys from SRS §7.8 (which specifies "26+"; the set has grown since).
// Constants for type-safe consumer code.

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
  // Premium job-posting products (Post a Job → job-type selector). Both are
  // inherently PAID (Naukri Hot Vacancy = top-of-search boost + branding + media;
  // SMB Pack = a Featured-grade post consumed from a subscription pack + CV
  // search). Per CLAUDE.md §0/§4 they ship OFF on Day 0: the type cards render
  // but are locked ("upgrade") until an admin flips these ON. Free Job +
  // Internship are always available (no flag). The trusted per-type enforcement
  // lands with the Phase 3 API (these are the UI/product gates).
  RECRUITER_HOT_VACANCY: 'recruiter.hot_vacancy.enabled',
  RECRUITER_SMB_PACK: 'recruiter.smb_pack.enabled',
  // Visibility of the recruiter "Billing" nav group and its two pages
  // (/plans, /billing). Deliberately SEPARATE from SUBSCRIPTION_SYSTEM: this
  // key controls whether a recruiter can SEE the plan catalogue and their own
  // (Free) subscription state; SUBSCRIPTION_SYSTEM controls whether anything
  // can be BOUGHT. Seeded enabled:TRUE — the surface is informational, not a
  // paid feature, so CLAUDE.md §0 ("paid features ship OFF") is satisfied by
  // leaving SUBSCRIPTION_SYSTEM off: every purchase CTA renders disabled
  // ("Coming soon") and the API's assertBillingEnabled still 403s.
  //
  // Why not just reuse SUBSCRIPTION_SYSTEM: that key is also read by
  // apps/api/src/applications/quota.service.ts, which feeds `upgradeAvailable`
  // into apps/web's ApplyButton — turning it ON would show rate-limited job
  // seekers an "Upgrade your plan → See plans" CTA pointing at /pricing, a
  // route that does not exist in apps/web. Keeping the two keys separate is
  // what keeps the job-seeker portal unaffected.
  RECRUITER_PLANS_VISIBLE: 'recruiter.plans_visible',

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
  // Recruiter Team / User management (SRS §4.9 — the "Users" panel: invite
  // teammates, edit in-company roles Owner/Admin/Member, set per-module
  // permissions, remove users). Emergency stop for the whole feature: when ON,
  // the /users page + /accept-invite/[token] page 404 (L2) and every
  // /recruiter/users mutation + the invite email producer reject with 503 (L3).
  // Seeded enabled:false, so the feature is LIVE by default; an admin flipping
  // this ON disables it without a redeploy. As a `killswitch.*` key it is
  // auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_USER_MANAGEMENT: 'killswitch.recruiter_user_management',
  // Recruiter Help & Support (the "Help & Support" sidebar group: searchable
  // FAQ, Contact Us form, Raise a Ticket + reply thread). Emergency stop for
  // the whole recruiter-facing surface: when ON, the /support/* pages 404 (L2)
  // and every /recruiter/support mutation rejects with 503 (L3). The admin
  // /admin/support console is deliberately NOT gated — staff can keep working
  // existing tickets while the switch is on. Seeded enabled:false, so the
  // feature is LIVE by default; an admin flipping this ON disables it without
  // a redeploy. As a `killswitch.*` key it is auto-classified critical
  // (Slack + confirm modal).
  KILL_RECRUITER_HELP_SUPPORT: 'killswitch.recruiter_help_support',
  // Recruiter "Post a Job" flow (the /post-job page + the POST /recruiter/jobs
  // create action). Emergency stop for posting: when ON, the /post-job page
  // 404s (L2) and the create endpoint rejects with 503 (L3). Job management
  // (edit/close/reopen on the /jobs list) is deliberately NOT gated — only the
  // posting action. Seeded enabled:false, so the feature is LIVE by default; an
  // admin flipping this ON disables posting without a redeploy. As a
  // `killswitch.*` key it is auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_POST_JOB: 'killswitch.recruiter_post_job',
  // Recruiter job deletion (the Jobs list 3-dot menu → Delete). Emergency stop
  // for the destructive action: when ON, DELETE /recruiter/jobs/:id rejects
  // with 503 (L3) and the Jobs list hides the Delete menu item (L2). Deletion
  // is already restricted to own jobs with zero applications — this switch is
  // the no-deploy off button on top of that. Seeded enabled:false, so deletion
  // is LIVE by default; an admin flipping this ON disables it without a
  // redeploy. As a `killswitch.*` key it is auto-classified critical (Slack +
  // confirm modal).
  KILL_RECRUITER_JOB_DELETE: 'killswitch.recruiter_job_delete',
  // Recruiter Job Detail "Collaborate" (adding teammates to a job so they can
  // help manage/respond to it). Emergency stop for the collaborator feature:
  // when ON, the collaborator endpoints (POST/DELETE /recruiter/jobs/:id/
  // collaborators) reject with 503 (L3) and the Job Detail page hides the
  // Collaborate control (L2). Existing collaborators keep their access (this
  // gates granting new access, matching the job-delete switch scope). Seeded
  // enabled:false, so collaboration is LIVE by default; an admin flipping this
  // ON disables it without a redeploy. As a `killswitch.*` key it is
  // auto-classified critical (Slack + confirm modal).
  KILL_RECRUITER_JOB_COLLABORATE: 'killswitch.recruiter_job_collaborate',
  // Admin job deletion (/sadmin/job-postings → Delete). Emergency stop for the
  // destructive action: when ON, DELETE /admin/jobs/:id rejects with 503 (L3)
  // and the Job Postings list renders the Delete control disabled (L2).
  //
  // Broader than KILL_RECRUITER_JOB_DELETE above and therefore more worth being
  // able to stop: that one reaches only the recruiter's OWN postings, this one
  // reaches any job on the platform. Deletion is already restricted to jobs with
  // zero applications — this switch is the no-deploy off button on top of that.
  //
  // There is deliberately NO middleware route gate (L1). The gated thing is an
  // ACTION, not a route: 404ing /sadmin/job-postings because deletion is killed
  // would take the read-only master list down with it, and that list is the only
  // surface that can see a DRAFT or never-moderated job at all. Same L2+L3 shape
  // KILL_RECRUITER_JOB_DELETE uses.
  //
  // Seeded enabled:false, so deletion is LIVE by default; an admin flipping this
  // ON disables it without a redeploy. As a `killswitch.*` key it is
  // auto-classified critical (Slack + confirm modal) by isCriticalFlag below —
  // no NON_KILLSWITCH_CRITICAL entry needed.
  KILL_ADMIN_JOB_DELETE: 'killswitch.admin_job_delete',

  // Moderation
  //
  // User-submitted content reports (the "Report this job" control on the public
  // job detail page → POST /v1/reports → the /sadmin/reports queue). Gates
  // INTAKE only: when OFF the control is hidden (L2) and the endpoint rejects
  // with 503 before touching the database (L3).
  //
  // There is deliberately NO middleware route gate (L1). The gated thing is an
  // ACTION, not a route — /job/[slug] is the public job page and must keep
  // serving. Same L2+L3 shape KILL_ADMIN_JOB_DELETE uses, and for the same
  // stated reason.
  //
  // The ADMIN side (/admin/reports, and the /sadmin console over it) is
  // deliberately NOT gated by this key: turning intake off must still let staff
  // clear a queue that already has rows in it. That is the rule admin-jobs,
  // admin-support and admin-otp-sessions already follow.
  //
  // Seeded enabled:true — reporting is a free safety surface, not a paid
  // capability, so CLAUDE.md §0 does not apply. Note this is NOT a
  // `killswitch.*` key, so it is not auto-classified critical: toggling it needs
  // no reason and fires no Slack alert, which is right for a feature toggle.
  //
  // Its sibling `moderation.jobs.enabled` predates the FLAG map and is still
  // read as a bare string literal in apps/api; do not copy that — use this
  // constant.
  MODERATION_REPORTS: 'moderation.reports.enabled',
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
