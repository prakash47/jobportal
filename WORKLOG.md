# WORKLOG — Active Development Board

> **The live "who is building what RIGHT NOW" board.** Its only job is to stop two
> developers from building the same table, feature, or component twice — and to
> stop two people from editing the same conflict-prone file at the same time.
>
> **This is NOT PROGRESS.md.**
> - `PROGRESS.md` = what has already **shipped** to `develop` (the permanent log).
> - `WORKLOG.md` = what is **in flight right now** (a short, fast-moving board).
>
> It is a **git-tracked file**, so it syncs to every machine on `git pull` / `git push`.
> Claude Code reads this at the start of every session and **before starting any new
> work** (CLAUDE.md §15). If your planned work overlaps something here, coordinate first.

---

## How to use it (takes 30 seconds)

1. **Start of session / before new work:** `git pull` the latest `develop`, then read this board.
2. **Check for overlap.** Is someone already building the thing you're about to build? Is the file/surface you need to edit locked below? If yes → ping them, pick something else, or wait.
3. **Claim it.** Add a row under **🔨 In Progress** with your name, branch, what you're building (name the DB models / components / endpoints), and which **shared surfaces** you'll touch.
4. **If you'll edit a shared surface** (schema, theme tokens, a barrel file — see the table) → also claim it under **🔒 Shared-surface locks**. Only one person holds a lock at a time.
5. **When merged:** move your row to **✅ Recently merged**, release any lock you held, and record the real entry in `PROGRESS.md`.
6. **Commit the WORKLOG change** together with your work (or as a tiny separate commit). It travels through git like everything else.

> Keep entries short. This board is meant to be glanced at, not read.

---

## 🔒 Shared-surface locks

These files are edited by everyone, so two simultaneous edits = guaranteed merge conflict or duplicate migration. **Hold the lock before you touch them; release it the moment your change is merged.** A lock should last hours, not days — make the change, merge, release.

| Shared surface | File / path | Held by | Branch | Since | Notes |
|---|---|---|---|---|---|
| **DB schema + migrations** | `packages/db/prisma/schema.prisma` (+ `prisma/migrations/`) | — free — | | | The #1 conflict source. See COLLABORATION.md §3. |
| **UI theme tokens** | `packages/ui/src/styles/theme.css` | — free — | | | New colors/spacing/tokens only. |
| **Shared types** | `packages/types/src/*` | — free — | | | Zod schemas + shared types. |
| **Web home barrel** | `apps/web/components/home/index.ts` | — free — | | | Append-only; coordinate big rewrites. |
| **UI atoms/molecules barrels** | `packages/ui/src/components/*/index.ts` | — free — | | | Append-only. |
| **Feature flags** | `packages/feature-flags/src/keys.ts` | — free — | | | New flag keys. |

> "Held by: — free —" means anyone can take it. To take it, replace `— free —` with your name + branch + date, commit, push. To release it, set it back to `— free —`.

---

## 🔨 In Progress

> One row per active piece of work. Name the concrete artifacts (models, components, endpoints) so overlap is obvious at a glance.

| Developer | Branch | Building (feature + models / components / endpoints) | Shared surfaces touched | Started |
|---|---|---|---|---|
| _(none in progress)_ | | | | |

---

## 🅿️ Planned / Up next

> Things claimed but not started yet — so others know they're spoken for.

| Developer | Feature | Notes |
|---|---|---|
| | | |

---

## ✅ Recently merged (rolling — keep ~last 10; the full permanent log lives in PROGRESS.md)

| Date | Branch | What shipped |
|---|---|---|
| 2026-07-03 | `feature/recruiter-help-support` | Recruiter **Help & Support** (sidebar group): searchable static **FAQ** + **Contact us** form + **Raise a ticket** with a reply thread. Models `SupportTicket`/`SupportTicketMessage`/`SupportContactMessage` (+ enums `SupportTicketStatus`/`SupportTicketCategory`, `NotificationType.SUPPORT_TICKET_UPDATED`, `ProfileAuditAction.SUPPORT_TICKET_STATUS_CHANGED`). API `recruiter-support` (create/reply/close/contact, killswitch 503, cross-user 404) + `admin-support` (`/admin/support/*` under AdminGuard, NOT killswitch-gated) + 2 email kinds + `notifyTicketUpdate` bell producer. Recruiter `/support/{faq,contact,tickets,tickets/[id]}`; admin `/admin/support` queue + detail + contact-messages (isolated subtree, apps/web job-seeker untouched). Flag `killswitch.recruiter_help_support`. Adversarial review: 2 findings fixed. |
| 2026-07-03 | `feature/clickable-job-cards` | **Whole job card is now clickable** (was title-only). Stretched-link: the title link's `::after` overlays the card/row so a click anywhere opens the job; the company link + save/apply/withdraw/expand controls are lifted with `relative z-10` so they still work; clamp/truncate moved to an inner `<span>` so the overlay isn't clipped by `overflow:hidden`. Applied to `srp/JobCard`, `profile/RecommendedJobCard`, `saved-jobs/SavedJobRow`, `applications/ApplicationRow` (overlay scoped to the top row so the expandable timeline stays free), `companies/CompanyOpenings`. Rail/related/hero cards already wrapped the whole card in one `Link`. Browser-verified via `elementFromPoint`: card body → job, save/company/expand → their own action. `apps/web` components only. |
| 2026-07-03 | `feature/job-detail-site-shell` | **Job detail page now carries the shared site chrome**: `/job/[slug]` + its `not-found` were rendering a bare `<main>` under the root layout (no navbar/footer) while the search page got `SiteShell` — so the same detail page looked inconsistent arriving from search or the dashboard. Wrapped both in `SiteShell` + `Container` (matches the search page's header/footer + width). No new rendering penalty (the page already reads cookies for apply/save → already dynamic). Browser-verified: navbar + footer present, 3-col body intact, no overflow. `app/job/[slug]/{page,not-found}.tsx` only. |
| 2026-07-03 | `feature/header-logo-seeker-dashboard` | Header **logo links straight to `/profile` for signed-in seekers** (no `/`→307→`/profile` hop): `SiteHeader` now reads the verified session (`Promise.all` with the Google-flag read) and sets the brand link + aria-label from `role === 'CANDIDATE'`. Role comes from the JWT claims (no DB lookup); anon + recruiters/admins keep home. No dynamic penalty (SiteHeader is only on already-dynamic home + SRP). curl-verified: authed header logo `href=/profile` (aria "dashboard"), anon `href=/` (aria "home"). Footer logo left at `/` (conventional). `SiteHeader.tsx` only. |
| 2026-07-03 | `feature/home-redirect-signed-in-seekers` | Signed-in **seekers no longer see the marketing home**: `apps/web/app/page.tsx` reads the verified session and `redirect()`s `role === 'CANDIDATE'` users to `/profile` before rendering — any visit to `/` (typed URL, logo, client nav, post-login) bounces to the dashboard. Anon + crawlers keep the full home (SEO); recruiters/admins keep it too. Stale cookie falls through (no loop). curl-verified: authed `/` → 307 `/profile`, anon `/` → 200, authed `/jobs` + `/profile` → 200. `apps/web/app/page.tsx` only — no schema/flags/locks. |
| 2026-07-03 | `feature/job-search-srp-redesign` | **Job-search SRP redesign** (`/jobs` + all `[...path]` SEO SRPs): shared site shell (reuses home `SiteHeader`/`SiteFooter`) on every search page + **signed-in user menu** (avatar → Dashboard/Saved/Applications/Alerts/Settings/Sign out; auth resolved client-side via `/auth/me`, no server cookie read → ISR-safe). 3-column `SrpShell` (filters · results · rail) with a prominent search toolbar + removable **active-filter chips**. Redesigned `JobCard` (+`CompanyLogo`, **real city names**, snippet, consolidated `formatSalaryLpa`/`formatExperienceMonths`/`postedAgo`). New `SrpRail` (job-alert CTA + one-role-per-company "roles at other companies"). Fixed 768–1023px filter dead-zone. Adversarial review: 3 findings fixed (logout hardening, rail `h2`, Hire-CTA hover AA). `apps/web` only — no schema/migration/flags/locks. |
| 2026-07-02 | `feature/job-detail-layout` | Redesigned `/job/[slug]` into a full-width hero card + 3-column grid (left: **Job overview** facts + **About-company** card; center: description; right: NEW **"Similar roles at other companies"** — shared-skill match at OTHER companies, with logos). New `JobHero`/`JobOverviewCard`/`AboutCompanyCard`/`RelatedRoles` + `lib/job/format.ts`; retired `JobHeader`/`JobMeta`/`SimilarJobs`; JSON-LD now emits real `employmentType`. Browser-verified 3-col/sticky/logos + mobile stack. `packages/ui` +Clock icon (append). |
| 2026-07-02 | `feature/seeker-dashboard-polish` | Seeker dashboard UI overhaul (all 10 pages): shared `PageHeader`/`ContentCard`/`Pagination`/`EmptyState` primitives → card-based restyle of applications/saved-jobs/alerts/profile-subpages/settings; expandable **application status timeline** from `Application.statusHistory` (read-only, no schema); scrollable status-filter chips with counts; mobile row stacking; **redesigned recommended-job cards** (company logo 44px + object-contain, resolved city names, ₹N–M LPA, skills, posted-age). Two adversarial reviews → 30 confirmed findings fixed (ARIA tablist→links, IST date hydration, contrast, corner clipping, legacy-row timeline). apps/web only — no schema, no flags, no locks |
| 2026-07-02 | `bugfix/signin-popup-redirect` | Seeker sign-in now lands on the dashboard: navbar `AuthModal` pushes `/profile` after login (was close+refresh-in-place, which also raced and swallowed navigation); `/login` bare-`/` fallback → `/profile` (matches Google OAuth fallback); `?next=` deep links unchanged. Browser-verified all 3 paths. apps/web auth components only |
| 2026-07-02 | `feature/recruiter-billing` | Recruiter **Plans & Billing** (Razorpay prepaid, company-scoped): `PaymentOrder`/`PaymentWebhookEvent`/`CompanyBillingProfile` + `Subscription.companyId` + `SubscriptionPlan.audience` + GST-extended `SubscriptionInvoice`; API `recruiter-billing` + `POST /webhooks/razorpay`; `/plans` + `/billing` pages + sidebar Billing group; middleware L1 on `subscription.system.enabled` (reused, no new key). Adversarial review: 14 findings fixed. apps/web untouched |
| 2026-07-01 | `feature/recruiter-user-management` | Recruiter **Users / Team management**: `RecruiterRole` (Owner/Admin/Member) + per-module permissions + `RecruiterInvite`; `recruiter-users` API (invite/revoke/role+perms/remove/accept/preview), `/users` panel + public `/accept-invite/[token]`; soft-remove + re-login block + reactivate-on-reinvite; `killswitch.recruiter_user_management`; registration now new-company-only (creator = Owner), join is invite-only. Adversarial review: 5 findings fixed. apps/web untouched |
| 2026-07-01 | `feature/recruiter-change-password` | Recruiter **Settings** sidebar group + **Change Password**: `POST /auth/recruiter/change-password` (verify current → new Argon2id hash → revoke all sessions + `RECRUITER_PASSWORD_CHANGE` audit in one txn → re-mint current device), `ChangePasswordDto` + `RecruiterPasswordService`, `/settings/change-password` page + `ChangePasswordForm`; moved `/notification-settings` → `/settings/notification-settings` (old path redirects); `killswitch.recruiter_change_password`. apps/web untouched |
| 2026-06-30 | `feature/recruiter-topbar-and-toggle-fix` | Recruiter UI follow-up: fixed invisible notification toggles (added missing `@source` for `@jobportal/ui` in recruiter `globals.css`); moved company logo + name + `KycStatusBadge` from the dashboard header into the `(authed)` top bar (shows on every page). Browser-verified. |
| 2026-06-30 | `feature/recruiter-notifications` | Recruiter notification settings + top-bar bell: `Notification`+`RecruiterNotificationPreference` models + `NotificationType` enum, `recruiter-notifications` API (list/unread-count/read/read-all + prefs), producers in `applications.apply()`+`admin-kyc.review()`, `/notification-settings` page + `NotificationBell` (polling), `killswitch.recruiter_notifications`. apps/web untouched |
| 2026-06-30 | `feature/recruiter-company-verification` | Recruiter Company Verification (KYC): `CompanyKyc`+`KycDocument`, `recruiter-kyc`+`admin-kyc` API, `/kyc` tab + status badge, `/admin/kyc-review`, `killswitch.recruiter_kyc` |
| 2026-06-21 | `feature/recruiter-profile-editing` | Recruiter profile + company editing + logo upload |
| 2026-06-21 | `feature/recruiter-single-email` | Recruiter single-email migration |
| 2026-06-20 | `feature/google-oauth` | Google OAuth login |

---

*Stale rows are noise. If something here has been merged or abandoned, clean it up — anyone can.*
