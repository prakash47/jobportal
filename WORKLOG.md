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
| Jayesh | `bugfix/signin-popup-redirect` | Fix: navbar sign-in popup doesn't redirect to the seeker dashboard after login (stays on home). `AuthModal.handleLoginSuccess` → push `/profile`; `/login` page bare-`/` fallback → `/profile` (matches the Google OAuth fallback). Files: `apps/web/components/auth/{AuthModal,LoginForm}.tsx`, `apps/web/app/(auth)/login/LoginPageForm.tsx` | none | 2026-07-02 |

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
