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
  // and every /recruiter/support mutation rejects with 503 (L3). The staff
  // console at /sadmin/support is deliberately NOT gated — staff can keep
  // working existing tickets while the switch is on, which is also why this
  // branch added no killswitch.admin_support_* key of its own. Seeded
  // enabled:false, so the
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
  // Admin subscription writes (/sadmin/subscriptions → Comp plan / Change plan /
  // Extend / Cancel). Emergency stop for the money-equivalent actions: when ON,
  // POST and PATCH /admin/billing/subscriptions reject with 503 (L3) and the
  // console renders those controls disabled (L2).
  //
  // This is the most consequential killswitch in the enum, because with the
  // Razorpay gateway unprovisioned and `subscription.system.enabled` OFF, this
  // console is the ONLY writer of Subscription rows in the product — there is no
  // second path an admin could fall back to, and equally nothing else to stop if
  // a grant goes wrong. It gates writes only; reading the console is never
  // gated (see below).
  //
  // There is deliberately NO middleware route gate (L1), matching
  // KILL_ADMIN_JOB_DELETE and MODERATION_REPORTS. The gated thing is an ACTION,
  // not a route: 404ing /sadmin/subscriptions would take down the only surface
  // that can see who is on which plan and when it renews, which is exactly the
  // information staff need most while writes are disabled. Killing the write
  // must not blind the read.
  //
  // Seeded enabled:false, so the admin actions are LIVE by default; flipping it
  // ON disables them without a redeploy. As a `killswitch.*` key it is
  // auto-classified critical (Slack + confirm modal) by isCriticalFlag below —
  // no NON_KILLSWITCH_CRITICAL entry needed, which is the right default for an
  // action that hands out paid plans for free.
  //
  // NOT to be confused with SUBSCRIPTION_SYSTEM below: that one gates whether
  // RECRUITERS can buy, and is read by two quota services that render
  // customer-facing "upgrade" CTAs. Reusing it here would tie staff's ability to
  // comp an account to the storefront being open, which is backwards — comping
  // matters most precisely while the storefront is shut.
  KILL_ADMIN_SUBSCRIPTION_WRITE: 'killswitch.admin_subscription_write',

  // Emergency stop for the content-report console's write actions
  // (/sadmin/reports → Claim / Uphold / Dismiss, including the job takedown
  // that Uphold can perform). One key covers all four, matching
  // KILL_ADMIN_SUBSCRIPTION_WRITE, which likewise covers four billing
  // mutations of very different severity: the thing an operator wants in an
  // emergency is "stop staff writing to this surface", not a per-verb dial.
  //
  // ⚠ Do NOT confuse this with MODERATION_REPORTS below, and do NOT reuse that
  // key here. They gate OPPOSITE HALVES of the same feature and have OPPOSITE
  // POLARITY. MODERATION_REPORTS gates INTAKE, is seeded ON, and its guard
  // throws on `!enabled`. This one gates the ADMIN QUEUE, is seeded OFF, and
  // its guard throws on `enabled` like every other killswitch. Turning intake
  // off must still let staff clear a queue that already has rows in it — the
  // rule admin-jobs, admin-support and admin-otp-sessions already follow — so
  // the two must be able to move independently.
  //
  // There is deliberately NO middleware route gate (L1), matching
  // KILL_ADMIN_JOB_DELETE, KILL_ADMIN_SUBSCRIPTION_WRITE and
  // MODERATION_REPORTS. The gated thing is an ACTION, not a route: 404ing
  // /sadmin/reports would take down the only surface that can see what users
  // have reported, which is exactly what staff need to look at while writes
  // are switched off. Killing the write must not blind the read.
  //
  // As a `killswitch.*` key it is auto-classified critical (Slack + confirm
  // modal) by isCriticalFlag below — no NON_KILLSWITCH_CRITICAL entry needed.
  KILL_ADMIN_REPORT_WRITE: 'killswitch.admin_report_write',

  // Emergency stop for the CSV export on the Transaction & Revenue Log
  // (/sadmin/transactions → Export). Gates the EXPORT ONLY — never the list,
  // never the detail page.
  //
  // That split is the whole point of a separate key. The thing an operator
  // reaches for here is "stop the platform's entire payment ledger leaving the
  // building in a file" — during an investigation, a suspected credential
  // compromise, or while a data-handling question is open. None of those are
  // reasons to blind staff to what was paid; if anything they are reasons to
  // need the screen more. So the read stays up and only the extraction stops.
  //
  // ⚠ Do NOT fold this into KILL_ADMIN_SUBSCRIPTION_WRITE. That key stops the
  // four money-MOVING actions on /sadmin/subscriptions (comp / change plan /
  // extend / cancel). Sharing one key would mean an operator who wants to stop
  // data leaving must also freeze staff's ability to comp an account, and an
  // operator who wants to freeze comps must also stop accounting getting its
  // month-end file. The two emergencies have nothing to do with each other.
  //
  // ⚠ Nor SUBSCRIPTION_SYSTEM: that is the customer-facing master purchase
  // switch, read by both quota services to decide whether to render "upgrade"
  // CTAs. Reusing it for a staff gate would change what CUSTOMERS see.
  //
  // There is deliberately NO middleware route gate (L1), matching
  // KILL_ADMIN_JOB_DELETE, KILL_ADMIN_SUBSCRIPTION_WRITE and
  // KILL_ADMIN_REPORT_WRITE. The gated thing is an ACTION, not a route: 404ing
  // /sadmin/transactions in order to stop a download would take down the only
  // surface in the product that can see the payment ledger at all.
  //
  // As a `killswitch.*` key it is auto-classified critical (Slack + confirm
  // modal) by isCriticalFlag below — no NON_KILLSWITCH_CRITICAL entry needed.
  KILL_ADMIN_TRANSACTION_EXPORT: 'killswitch.admin_transaction_export',

  // Emergency stop for DISPATCHING a broadcast (/sadmin/broadcasts → POST
  // /admin/broadcasts/:id/send). This is the highest-blast-radius action in the
  // product: one click puts a message in front of every recruiter or every
  // candidate on the platform, and unlike every other admin action here it
  // cannot be undone — an email that has left cannot be recalled.
  //
  // Gates SENDING only. Composing, listing, reading a past broadcast and its
  // per-recipient ledger all keep working, matching KILL_ADMIN_TRANSACTION_EXPORT
  // and KILL_ADMIN_JOB_DELETE: stopping the dangerous verb must not blind staff
  // to what has already gone out — which is exactly what they need to see during
  // whatever incident made someone reach for this switch.
  //
  // It also stops IN-FLIGHT delivery, which is what distinguishes it from the
  // other admin killswitches. The worker re-reads it before every batch, so
  // flipping it on halts a send that is already fanning out rather than only
  // preventing new ones. That is the whole reason a switch exists here: a
  // broadcast is the one action whose damage keeps accumulating after the
  // request that started it has returned.
  //
  // ⚠ Deliberately NOT folded into `killswitch.transactional_emails`. That key
  // stops ALL outbound mail including password resets and verification codes;
  // an operator who needs to stop one bad announcement should not have to lock
  // every user out of their own account to do it. The broadcast worker
  // nonetheless honours BOTH, so the global stop still covers this path — the
  // relationship is "either halts it", not "one replaces the other".
  //
  // There is deliberately NO middleware route gate (L1), matching every other
  // admin console: 404ing /sadmin/broadcasts to stop a send would take down the
  // only surface that can see what was sent.
  //
  // As a `killswitch.*` key it is auto-classified critical (Slack + confirm
  // modal) by isCriticalFlag below — no NON_KILLSWITCH_CRITICAL entry needed.
  KILL_ADMIN_BROADCAST_SEND: 'killswitch.admin_broadcast_send',

  // Emergency stop for STAFF PROVISIONING (/sadmin/roles → the write half of
  // POST /admin/staff/*). Gates inviting, resending, revoking, changing a role
  // or its permission overrides, deactivating and reactivating — and, unlike
  // every other admin killswitch here, also the two PUBLIC token endpoints
  // (GET preview / POST accept-invite), because accepting an invite CREATES an
  // admin account and is therefore the most consequential write in the group.
  //
  // This is the switch for "we think a super-admin account is compromised".
  // What an attacker with that access does first is provision themselves a
  // second, quieter way back in; this is the lever that stops that while the
  // question is being answered, without taking down the console that shows who
  // currently holds what.
  //
  // Gates WRITES only. The roster, the pending-invite list and each staffer's
  // resolved permission map all keep rendering, matching
  // KILL_ADMIN_BROADCAST_SEND, KILL_ADMIN_TRANSACTION_EXPORT and
  // KILL_ADMIN_JOB_DELETE: killing the write must not blind the read, and
  // during exactly the incident that makes someone reach for this switch, "who
  // has access right now" is the first thing anyone needs to see.
  //
  // ⚠ It does NOT revoke anything already granted. An existing staff row stays
  // live and an already-accepted invite stays accepted — this only stops NEW
  // grants. Removing a specific person is still Deactivate, which revokes their
  // sessions in the same transaction and takes effect on their next request.
  // Flipping this ON while staff are signed in changes nothing for them.
  //
  // ⚠ It also does not protect SUPER_ADMIN. That tier is never UI-creatable in
  // the first place (ASSIGNABLE_ADMIN_STAFF_ROLES excludes it, FR-4.12.10), so
  // there is no path here for this switch to close.
  //
  // There is deliberately NO middleware route gate (L1), matching every other
  // admin console — and here the reason is sharper than usual: apps/sadmin's
  // middleware does not authenticate and cannot evaluate flags at all (its
  // runtime is pinned to nodejs precisely because the flag client cannot run on
  // Edge). L2 disables the controls and renders a banner; L3 in apps/api is the
  // non-bypassable boundary and returns 503.
  //
  // As a `killswitch.*` key it is auto-classified critical (Slack + confirm
  // modal) by isCriticalFlag below — no NON_KILLSWITCH_CRITICAL entry needed.
  KILL_ADMIN_ROLES_WRITE: 'killswitch.admin_roles_write',

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
