# JobPortal — Progress Log

> **Purpose**: Running record of what has actually shipped to `develop`. Read after `CLAUDE.md` at the start of every new session so you have current context without re-deriving it from `git log`.
>
> **What this file IS**: cumulative shipped work, currently-in-flight branches, queued follow-ups, deliberate deferrals.
>
> **What this file is NOT**: the SRS (`docs/SRS.pdf` is the source of truth for *what* to build), the project rules (`CLAUDE.md` is the source of truth for *how*), or a TODO list for new work.
>
> **Update protocol**: after a feature/bugfix/chore PR is merged to `develop`, append a new entry under "PR log" and tick the relevant box in "Phase 1 build order" if applicable. Keep the snapshot at the top fresh.

---

## Snapshot — 2026-06-30

- **Current phase**: Phase 1 — Freemium MVP (CLAUDE.md §13), complete. Active work is **post-Phase-1 recruiter + job-seeker UX**: the seeker dashboard redesign (PR #47, on `develop`), recruiter **Company Verification (KYC)**, and now recruiter **Notification settings + bell** (merged below).
- **Phase 1 progress**: **18 of 18** build-order items merged. **Phase 1 is complete.**
- **Branch state**: `develop` is the integration tip; `main` is still the initial scaffold (no production release cut yet).
- **Last merge**: `feature/recruiter-notifications` — recruiter **Notification settings + top-bar bell** (see PR log below). Prior: `feature/recruiter-company-verification` — recruiter **Company Verification (KYC)**: new `/kyc` "Verification" tab (submit business-registration doc + GST number + authorized-person ID proof → Pending/Verified/Rejected badge), admin review console at `/admin/kyc-review`, and a `killswitch.recruiter_kyc` emergency stop. Additive migration `20260630073302_add_company_kyc` (new `CompanyKyc` + `KycDocument`); new API modules `recruiter-kyc` + `admin-kyc`; KYC docs are private (signed-URL only). **apps/web job-seeker surface byte-untouched** — only the isolated `app/admin/*` subtree was added. (Earlier note still applies: the PR log between ~2026-05-17 and the recruiter-single-email entry is incomplete — several `develop` merges predate disciplined logging; treat older snapshot detail as approximate.)
- **Local runtime status (DB verified 2026-06-21)**: Docker (Postgres 18 + Redis 8 + Elasticsearch 9.4) up; `jobportal_dev` reset + reseeded + ES reindexed cleanly; `pnpm build` green for all 4 apps. App dev servers (`:3000/:3001/:4000`) not booted this session. ES indices repopulated (50 jobs, 12 companies, 3 articles in `jobs-v2`/`companies-v2`/`articles-v2` — alias version reset by the DB rebuild).
- **Seed catalogue**: 32 flags (added `killswitch.recruiter_notifications`) / 10 industries / 50 cities / 160 skills / 4 plans / 3 articles. Plus the demo overlay (stable Job IDs 100001-100050, Job_id_seq advanced past): 12 companies / 8 recruiters / 38 reviews / 50 jobs / 20 candidates / 371 applications.
- **Test counts on develop**: **364 API** + 181 web + 37 feature-flags + 18 observability + auth = ~617 unit tests (recruiter-notifications added 33 API tests: recruiter-notifications service + producer + dto, plus fire-and-log + producer-hook coverage in the applications + admin-kyc service tests).
- **Locked stack as of CLAUDE.md §1**: Next 16.2 / React 19.2 / Tailwind 4.2 / NestJS 11 / Prisma 7.4 / Postgres 18 / Elasticsearch 9.4 / Redis 8 / BullMQ 5.76 / Resend / R2 / Sentry / PostHog.

---

## Phase 1 build order (CLAUDE.md §13)

- [x] **1. monorepo-scaffold** — PR #1
- [x] **2. db-schema-and-prisma** — PR #3 (SRS §8)
- [x] **3. feature-flag-system** — PR #4 (SRS §7)
- [x] **4. auth-jwt-system** — PR #5 (SRS §4.12)
- [x] **5. design-system** — PR #6
- [x] **6. elasticsearch-integration** — PR #7 (SRS §4.14)
- [x] **7. job-search-srp** — PR #9 (SRS §4.1, §6.1)
- [x] **8. job-detail-and-jsonld** — PR #14 (SRS §4.2, §6.3)
- [x] **9. user-profile-and-resume** — PR #15 (SRS §4.3)
- [x] **10. apply-and-saved-jobs** — PR #17 (SRS §4.2, §4.4, §4.6)
- [x] **11. job-alerts-bullmq** — PR #18 (SRS §4.5)
- [x] **12. application-tracking** — covered by PR #17 (`/applications` dashboard + state machine + withdraw) and PR #19 (tier limits / quota per SRS §4.11.16-17)
- [x] **13. companies-directory** — PR #20 (SRS §4.7)
- [x] **14. career-advice-cms** — PR #21 (SRS §4.8)
- [x] **15. recruiter-portal** — PRs #22 (registration + shell, SRS §4.9.1-2) + #23 (job posting + applicants, SRS §4.9.3-7)
- [x] **16. admin-console** — PR #25 (SRS §4.16, §7.7)
- [x] **17. sitemap-and-seo** — PR #31 (SRS §4.15)
- [x] **18. observability** — PR #32 (Sentry on web + recruiter + API + 3 BullMQ workers; PostHog on web with 5 product events)

**Bonus shipped (not in original Phase 1 list but landed early)**: notifications + transactional email (PR #24, SRS §4.13).

---

## PR log

Most recent first. Each entry: PR number, branch, SRS section, one-paragraph summary of what was actually shipped, plus any deliberate deferrals or follow-ups.

### `feature/recruiter-notifications` · 2026-06-30

Recruiter **Notification settings + a top-bar notification bell** — a new "Notification settings" tab where a recruiter toggles email on/off and SMS on/off, plus a bell in a new sticky top bar (on every dashboard page) showing in-app alerts. CLI merge (no PR). Scoped to recruiter code paths + shared `apps/api` + `packages/db`/`feature-flags` — the **`apps/web` job-seeker surface is byte-untouched** (web test suite unchanged at 181; the only shared-service edits are additive, non-blocking notification writes in `applications.service` + `admin-kyc.service` that don't alter candidate behavior).

**What shipped:**
- **Schema** (additive migration `20260630085239_add_recruiter_notifications`): new **`Notification`** model (generic `userId` recipient, `type`/`title`/`body`/`linkUrl`/`readAt`/`createdAt`, indexes on `[userId, readAt]` for the unread badge + `[userId, createdAt desc]` for the feed); new **`RecruiterNotificationPreference`** (`userId @unique`, `emailEnabled @default(true)`, `smsEnabled @default(false)`) — deliberately **separate from the candidate-shared `EmailPreference`** so `/me/notifications` is untouched; new **`NotificationType`** enum (`NEW_APPLICATION`/`KYC_VERIFIED`/`KYC_REJECTED` — "message" omitted, no source in Phase 1). Two additive back-relations on `User`.
- **API — `recruiter-notifications`** (`JwtAuthGuard`+`RolesGuard('RECRUITER')`, userId from JWT): `GET /recruiter/notifications` (list + unreadCount), `GET …/unread-count` (bell poll), `PATCH …/:id/read` (ownership-scoped → 404 on cross-user, no leak), `POST …/read-all`, `GET`/`PATCH /recruiter/notification-preferences`. Fire-and-log **producers** write notification rows at the real source events: `applications.service.apply()` → `NEW_APPLICATION` to `Job.postedById`; `admin-kyc.service.review()` → `KYC_VERIFIED`/`KYC_REJECTED` to all recruiters on the company. Producers are non-blocking (`.catch(log)`) — a write failure never 5xxes the candidate apply or the admin review.
- **Recruiter UI**: 5th "Notification settings" sidebar item → `/notification-settings` page (RSC reads prefs via Prisma) with two `Switch` toggles (auto-save, re-sync from server on failure). New **sticky top bar** in the `(authed)` layout hosting `NotificationBell` (shown on every dashboard page): `IconButton`+`Popover`+unread `Badge`, initial count/feed server-rendered, **~35s polling** of the unread-count endpoint (no realtime transport in this stack — polling is the pragmatic MVP), optimistic mark-read/mark-all-read with rollback.
- **Flag**: `killswitch.recruiter_notifications` (BOOLEAN, seeded **OFF** → feature LIVE by default) — emergency stop with three-layer enforcement: L2 (the `/notification-settings` page `notFound()` + the bell hidden in the layout), L3 (service throws `ServiceUnavailable` on mutations + the producer no-ops). Added to both `keys.ts` and `seed/flags.ts` (now 32 flags).

**SMS scope**: the SMS toggle **persists** but actual SMS *delivery* is deferred to Phase 2 — no SMS provider is configured (Resend is email-only). The settings page labels SMS "coming soon"; the in-app bell is the live channel this PR. Outbound email/SMS fan-out gated on these prefs is a clean fast-follow.

**Adversarial multi-agent review** (6 dimensions → independent per-finding verification, 16 findings / 10 confirmed) fixed in-branch: bell optimistic mark-read/mark-all-read now roll back on PATCH failure; a mutation-stamp guard stops an in-flight poll from clobbering an optimistic decrement; the unread badge darkened to clear WCAG AA; the settings form re-syncs from server truth on failure (race-safe under rapid toggles) + `aria-describedby` links each channel's description/SMS-note to its switch; the settings page uses `requireRecruiter()` (no cross-file non-null assertion); the bell's initial feed limit aligned to the BFF page size; and **fire-and-log rejection tests** added to both callers proving `apply()`/`review()` still succeed when the producer throws. Dismissed as non-issues: killswitch fail-open (by design), the always-shown nav item landing on a 404 when the killswitch is ON (consistent with the KYC "Verification" tab), and several false-positive nits.

**Gate (integrated state):** workspace typecheck **11/11** · tests **API 364 (+33)** + web **181 (unchanged → apps/web isolation confirmed)** + packages green · `pnpm build` **4/4** apps. Migration applied to a clean local DB; Prisma client regenerated. Live browser walk-through not run this session (offered as a fast follow-up).

**Deferred / follow-ups:** SMS provider + outbound delivery (Phase 2); recruiter notification **emails** via the existing Resend pipeline gated on `emailEnabled` (infra exists — a clean fast-follow; this PR persists the pref + ships the in-app bell); SSE/WebSocket push to replace polling (the Redis pub/sub pattern in `feature-flags/cache.ts` is the blueprint); a "message" notification type once recruiter↔candidate messaging exists; optional busy-spinner on bell re-fetch (acceptable to omit under the <300ms API p95 budget).

### `feature/recruiter-company-verification` · 2026-06-30

Recruiter **Company Verification (KYC)** — a new "Verification" tab in the recruiter portal where an HR submits company identity (business-registration document, GST number, authorized-person ID proof) and earns a Pending / Verified / Rejected badge once an admin approves. CLI merge (no PR). Scoped to recruiter code paths + a **new isolated admin subtree** under `apps/web/app/admin/` — the `apps/web` **job-seeker surface is untouched** (only `app/admin/*` + `components/admin/*` were added). Naming, schema shape, and process were grounded in a research pass over India KYB norms + competitor flows (Naukri/Apna/Indeed/LinkedIn) + DPDP-Act handling.

**What shipped:**
- **Schema** (additive migration `20260630073302_add_company_kyc`): **company-level** `CompanyKyc` (1:1 `Company`, `@unique companyId` — multiple recruiters share one Company) holding `legalName`/`gstNumber`/`panNumber`/`registrationNumber` + authorized-signatory fields + a `KycStatus` state machine (`NOT_SUBMITTED`/`PENDING`/`VERIFIED`/`REJECTED`) + review metadata (`submittedAt`/`reviewedAt`/`reviewedById`/`rejectionReason`); `KycDocument` (many per KYC, soft-deletable, private R2 `r2Key`, type `BUSINESS_REGISTRATION`|`AUTHORIZED_PERSON_ID`). Five new `ProfileAuditAction` values reuse the existing `ProfileAuditLog`.
- **API — `recruiter-kyc`** (`JwtAuthGuard`+`RolesGuard('RECRUITER')`, companyId resolved from JWT): `GET/PUT /recruiter/kyc`, `POST/DELETE /recruiter/kyc/documents[/:id]`, `GET /recruiter/kyc/documents/:id/download` (15-min signed URL), `POST /recruiter/kyc/submit`. GSTIN/PAN format-validated (regex + normalize); ClamAV scan before private R2; supersede-on-reupload made race-free via a `FOR UPDATE` row lock on the parent `CompanyKyc`; audit writes. **KYC docs are never public** — signed-URL only, never the `/media` route.
- **API — `admin-kyc`** (`AdminGuard`): `GET /admin/kyc` (paginated queue, GSTIN **masked**), `GET /admin/kyc/:companyId` (full identifiers + per-document signed URLs), `PATCH /admin/kyc/:companyId` (approve/reject + required reason), audit-logged.
- **Recruiter UI**: 4th "Verification" sidebar item → `/kyc` page (RSC reads `CompanyKyc` via Prisma); identifier form (inline GSTIN/PAN hints) + two auto-firing document uploaders (mirror `LogoUpload`) + submit; read-only once PENDING/VERIFIED. `KycStatusBadge` (colour + icon + text, WCAG) also on the dashboard + profile headers.
- **Admin UI** (isolated `apps/web/app/admin/` only): `/admin/kyc-review` queue + `/admin/kyc-review/[companyId]` detail with approve/reject; "KYC review" added to the admin nav.
- **Flag**: `killswitch.recruiter_kyc` (BOOLEAN, seeded **OFF** → feature LIVE by default) — emergency stop enforced at the API service (L3) + the recruiter `/kyc` page (L2 `notFound()`). KYC is a free trust feature (not paid), so it ships unflagged-by-default with a killswitch (owner-chosen). Added `@jobportal/feature-flags` as a recruiter-app dependency for the L2 gate.

**Privacy (DPDP Act 2023):** documents stored privately in R2, served only via short-lived signed URLs to the owning recruiter + admins (never public); raw GSTIN/PAN never logged or written to audit JSON; GSTIN masked in the admin list (full value only on the reviewer detail page).

**Adversarial multi-agent review** (3 dimensions → independent per-finding verification) confirmed + fixed in-branch: (1) a race on concurrent same-type uploads → `FOR UPDATE` row-locked supersede + atomic `getOrCreateKycId` upsert; (2) a missing API-side status guard → `assertEditable` freezes edits while PENDING/VERIFIED on saveKyc/uploadDocument/deleteDocument (the API is the trusted boundary, not just the UI). Remaining candidates were verified as false positives / acceptable-by-design.

**Gate:** workspace typecheck **11/11** · tests **API 331 (+48 new KYC)** + web 181 + packages green · `pnpm build` **4/4** apps. Migration applied to a clean local DB.

**Deferred (Phase 2 / out of scope):** live GSTN/MCA registry verification (manual admin review for MVP); at-rest encryption/tokenization of GSTIN/PAN (currently access-controlled storage + masked admin list + never-logged); public "Verified" badge on job-seeker company pages/job cards (would touch the apps/web job-seeker surface); gating job-posting on verification; recruiter email notifications on submit/approve/reject (the BullMQ/Resend pipeline exists — a clean fast-follow).

### `feature/seeker-dashboard-ui-layout-update` · 2026-06-28

Full **seeker dashboard redesign**. The dashboard lives at `/profile` (the codebase calls it "the dashboard"; there is no `/dashboard` route). UI/UX work spanning the §4.3 profile, §4.4 saved jobs, §4.5 alerts, and §4.6 applications surfaces. Committed + pushed to origin; **merge to `develop` pending**. No schema migration, no feature flag (the dashboard is core, free Day-0 functionality — matches the unflagged profile editor). `apps/web` (seeker) + shared `@jobportal/ui` only.

**What shipped:**
- **Unified app-shell with a persistent sidebar** (new `apps/web/components/dashboard/`): a fixed navy (`--color-primary-600`, #192249) left rail — Career Queue brand → grouped nav (Dashboard · *Job search*: Applications / Saved jobs / Job alerts · *My profile*: Personal details / Education / Experience / Skills / Resume · *Account*: Notifications) → account card + sign-out pinned at the bottom, cyan active state. A top bar carries a search launcher (→ `/jobs`), the daily-apply quota pill, and a "Find jobs" action. `DashboardShell` (server; resolves the display name via a `React.cache`d lookup) wraps `DashboardChrome` (client). Replaces the four duplicated per-section "JobPortal" top bars — the stale wordmark is gone.
- **Every seeker section now renders inside the shell**: the `/profile/*`, `/applications`, `/saved-jobs`, `/alerts`, and `/settings/notifications` layouts all delegate to `DashboardShell` (new `app/settings/layout.tsx`); the public `/alerts/unsubscribe/[token]` stays bare for logged-out visitors.
- **Redesigned dashboard home** (`/profile`): "Welcome back, {name}" → a profile-strength / next-steps card → four activity metric cards (Applications / Saved jobs / Job alerts / Profile views) → an Elasticsearch-backed "Recommended for you" feed.
- **Personal details — "Are you working or a fresher?" toggle** (`ProfileForm`): wired to the existing `Candidate.workStatus` enum (no migration). "Working" reveals the work-history fields (title, experience, salaries, notice period); "Fresher" hides them and saves `workStatus=FRESHER` (the PATCH DTO can't null fields, so prior values just stay hidden behind the status).
- **Education editor now reuses the exact onboarding form**: `/profile/education` renders the onboarding `EducationStep` (First degree + Class 12 sections) via a new `EducationOnboardingForm`, with the same upsert semantics (POST/PATCH `/me/education`; the `Class XII` sentinel discriminates the Class 12 row). The tiny `SectionHeading` was extracted to its own file so the page doesn't pull in EmploymentStep's heavy editors.
- **Removed** (obsolete after the redesign): the old free-form `EducationManager`, `ProfileNav`, and an interim `AccountShell`/`DashboardHeader`/`SignOutButton` from a first-pass hub the redesign superseded. Added 4 nav icons to `@jobportal/ui`.

**Adversarial multi-agent reviews** were run on the substantive diffs; confirmed findings fixed in-branch: the mobile drawer now honours its `aria-modal` contract (body scroll-lock, `inert` background, Tab focus-trap, focus restored to the trigger on close, auto-close on resize-to-desktop); sidebar group-label contrast raised to AA on navy; metric-card radius aligned; a dead `StatCard.hint` prop removed; the recommended-jobs empty state made skill-aware (distinguishes ES-down from a true no-match). Logout-CSRF and a few others were reviewed and dismissed as non-issues (refresh cookie is `SameSite=Lax`).

**Gate:** workspace typecheck **11/11** · `pnpm --filter @jobportal/web build` green. Browser-verified against the running stack with throwaway seekers (since deleted): sidebar persists across pages with correct `aria-current`; mobile drawer opens / scroll-locks / closes accessibly; the working/fresher toggle saves + round-trips; the education form saves (2 rows), prefills on reload, and re-saves as PATCH (no duplicates); zero console errors. No unit tests added (presentational/UI change).

**Deferred / notes:** dark mode stays dormant (no `ThemeProvider`), so the navy rail is fixed-dark in both modes by design; the daily-apply quota pill is hidden below `sm` (tight top bar); the education form, like onboarding, manages exactly one degree + Class 12 — extra legacy rows from the old free-form editor stay in the DB untouched but aren't shown.

### `feature/recruiter-profile-edit` · 2026-06-21

Recruiter **Profile tab is now editable** (refinement of SRS §4.9.1). CLI merge (no PR). Scoped to recruiter code paths + `packages/db` — **`apps/web` and candidate auth/profile (`apps/api/src/auth`, `apps/api/src/profile`) are byte-untouched** (verified via `git status`).

**What shipped:**
- **Schema** (additive migration `20260621064256_recruiter_profile_editing`, history now 13): `Recruiter` gains `department` + `altPocName`/`altPocEmail`/`altPocPhone` (alternate POC); `Company` gains `companyType` (new `CompanyType` enum — Indian-market set: Startup / Indian MNC / Foreign MNC / Private / Public / Government·PSU / NGO·Non-profit / Partnership / Sole Proprietorship); `ProfileAuditAction` gains `RECRUITER_PROFILE_UPDATE` / `COMPANY_UPDATE` / `COMPANY_LOGO_UPDATE`. All columns nullable → no impact on existing reads.
- **API** (new `recruiter-profile` module): `PATCH /recruiter/profile` (recruiter-personal fields), `PATCH /recruiter/company` (name/description/website/companyType/industry/HQ-city/employees/founded), `POST`+`DELETE /recruiter/company/logo`. `JwtAuthGuard + RolesGuard('RECRUITER')` is the trusted L3 boundary; company id resolved server-side from the JWT, never the body. Edits write `ProfileAuditLog` rows (reuses candidate `buildDiff`/`stripUndefined` leaf utils) and fire-and-log `syncCompany()` only when an ES-mirrored field changes.
- **Logo pipeline**: PNG/JPG/WebP only (SVG rejected — script-injection risk), ≤2 MB, ClamAV-scanned, stored in R2; `Company.logoUrl` holds a permanent public URL. `StorageService` gains `getPublicUrl`/`getObject`/`keyFromPublicUrl`; new `MediaController` (`GET /media/company-logos/:file`) serves logos publicly **in local dev only** (dormant in prod where `R2_PUBLIC_URL` points at the CDN). `R2_PUBLIC_URL` added to `.env.example`.
- **Recruiter UI**: Profile tab → two editable sections (your details / company details) + auto-uploading logo picker (preview / replace / remove). Logo renders **before the company name** on the dashboard. Reads via RSC/Prisma, mutations via the BFF. Added image `remotePatterns` (the app had none) + a recruiter-local `api-client` and `CompanyLogo`.

**No feature flag** — profile editing is core, free Day-0 functionality (matches the unflagged candidate profile editor; owner-confirmed).

**Review fixes (same branch):** (1) uploaded logo rendered as a broken image because the Next image optimizer 400s on the local `http://localhost:4000/media` URL (`"url" parameter is not allowed`) while the raw URL serves 200 → company logo `<Image>` is now `unoptimized` (browser loads it directly; logos are small pre-sized assets, optimization adds nothing). (2) the authed app shell now locks the viewport (`h-screen` + `overflow-hidden`) and scrolls each pane independently so the sidebar stays fixed while only the content pane scrolls.

**Gate:** workspace typecheck 11/11 · tests **258 API (+23)** + 181 web + auth/feature-flags/observability green · `pnpm build` 4/4 apps. End-to-end smoke-tested against the running stack (login → PATCH profile → PATCH company → logo upload → public `/media` serve 200 → persist → PDF-reject 400 → DELETE).

**Deferred / follow-ups:** `MediaController` is a dev convenience — production needs `R2_PUBLIC_URL` + a real R2 public bucket/CDN (the host must also be whitelisted in each app's `next.config` image patterns). In local dev R2 is unconfigured, so logos live in the API's in-memory store and vanish on API restart (re-upload). `CompanyLogo` is duplicated in web + recruiter (consolidating into `@jobportal/ui` is a standing chip). Company edits are last-write-wins across multiple recruiters sharing one company (acceptable for MVP).

### `feature/recruiter-single-email` · 2026-06-21

Recruiter registration now collects a **single "Email ID"** instead of two separate "login email" + "work email" inputs (refinement of SRS §4.9.1). CLI merge (no PR). Owner is now working exclusively on the recruiter portal, so this is scoped to recruiter-only code paths + `packages/db` — **`apps/web` and candidate auth (`apps/api/src/auth`) are byte-untouched** (verified via `git grep`).

**What changed:**
- **Schema**: dropped the redundant `Recruiter.workEmail` column (it was always derivable from `User.email`). Kept `Recruiter.workEmailVerified` as the job-post gate — the verification link (now sent to the single Email ID) still flips it. Name kept deliberately to avoid colliding with `User.emailVerified` (candidate flow + JWT claims).
- **API** (`recruiter-auth`): `RegisterRecruiterDto` drops `workEmail`; registration writes only the single email and sends the verification link there. `recruiter-jobs` gate comment + error copy updated (logic unchanged — already used `User.email`).
- **Recruiter UI**: register page asks for one field labeled **"Email ID"**; dashboard / jobs-new / profile read `recruiter.user.email`; profile collapses its two email rows into one. Banner + gate copy softened "work email" → "email".
- **Demo seed**: the 8 recruiter rows drop `workEmail`.

**Migration + DB reconciliation** (the messy part): the local `jobportal_dev` DB had diverged from the repo — an orphan `20260614104341_sync` migration was applied while the repo's `google_oauth` migration (adds `User.provider`/`googleId`/`image`) was **not**. An owner-consented `prisma migrate reset` replayed all 11 repo migrations + the new `20260621040149_recruiter_single_email` drop, discarding `_sync` and finally applying `google_oauth`. `prisma migrate status` is now "up to date" with a clean **12-migration** history. Reseeded base + demo + apps (12 companies / 8 recruiters / 50 jobs / 20 candidates / 371 applications) + ES reindex (`jobs-v2`/`companies-v2`/`articles-v2`).

**Gate (clean state)**: typecheck 11/11 · tests 235 API + 181 web + auth/feature-flags/observability all green (counts unchanged — edited existing recruiter tests in place) · `pnpm build` 4/4 apps. `ARCHITECTURE.md` Recruiter-entity line updated.

**Email verification delivery (same branch)**: the recruiter verification pipeline was fully built (enqueue → BullMQ worker → `ResendClient.send` → click `/verify-email/[token]` → `verify()` flips `workEmailVerified`) but **dormant locally** because `RESEND_API_KEY` was blank — `ResendClient.send()` is a no-op console stub then, so no email ever left the process. Fix was **config, not code**: set `RESEND_FROM` in both env files (the in-code default `noreply@jobportal.com` is an unverified domain Resend rejects) and documented it in `.env.example`. Confirmed **live delivery** to the owner's Resend-account address via the shared test sender (`onboarding@resend.dev`, Resend message-id returned). The click→verify→status-update path is unchanged prior-shipped code (PR #22) with passing unit tests. Added `apps/api/scripts/send-recruiter-verification.ts` — an ops helper to (re)send a verification link by `recruiterId` (DB-looked-up recipient, `--dry-run`), filling in for the still-absent in-app resend (Task 16). **Caveat**: the test sender only delivers to the Resend-account email; emailing arbitrary recruiters requires verifying a domain in Resend.

**Deferred (noted, not done)**: `RecruiterWorkEmailService` class name still says "WorkEmail" (internal only; it now does generic recruiter email-verification) — left as-is to avoid churn beyond the schema change. The recruiter work-email **resend** affordance is still absent in-app (pre-existing; tied to admin-console Task 16) — the new ops script is the interim stopgap. Domain verification in Resend (to email real recruiters, not just the owner's address) is owner-side config, not yet done.

### `feature/header-footer-branding` · 2026-06-17

Career Queue (CQ) brand rollout across the job-seeker + recruiter chrome. CLI merge (no PR; no SRS section — branding/UI). Three commits:

1. **web** — replaced the text "JobPortal" wordmark in the homepage `SiteHeader` (CQ monogram) and `SiteFooter` (full lockup) with the supplied CQ logo, and renamed the visible header/footer copy to "Career Queue" ("Hire on Career Queue", "© Career Queue"). New `apps/web/components/brand/Logo.tsx` (mark/lockup variants) renders the colour logo on light surfaces and the white reverse logo under `[data-theme="dark"]`; registered a `dark` Tailwind variant in `globals.css` (none existed before). Brand kit saved under `apps/web/public/brand/` — 5 source PNGs (all transparent RGBA, 2967×1784) + 4 web-optimised derivatives `cq-{mark,logo}-{color,white}.png` (monogram cropped above the wordmark for the slim header).
2. **recruiter** — mirrored the same in the `(auth)` header and `(authed)` sidebar (CQ mark + a muted "Recruiter" qualifier). Assets copied to `apps/recruiter/public/brand/`; matching `Logo.tsx` + `dark` variant. `Logo` is intentionally duplicated per app (each Next app serves its own `/public/brand`); consolidating into `@jobportal/ui` is a noted follow-up.
3. **web fix** — the homepage header nav (Jobs / Companies / Career advice) sat left-of-centre after the logo swap, because flex `justify-between` centres the nav between the asymmetric logo/CTA, not in the header's true centre. Switched the header container to a 3-col grid `[1fr auto 1fr]`; nav is now truly centred, logo pinned left, CTA right, mobile unaffected.

**Deferred (owner decision)**: the site-wide rebrand — page `<title>`/metadata, JSON-LD `name`, and other routes' chrome still read "JobPortal". Only the header/footer + recruiter-portal chrome text changed. Dark mode remains dormant in both apps (no `ThemeProvider` mounted), so the white logo is wired-but-inactive until that lands — a natural follow-up.

**Gate (integrated state)**: workspace typecheck 11/11, full test suite green (api 235 + web 181 + auth/feature-flags/observability), `pnpm build` 4/4 apps green with the local stack up. No new tests (presentational change; `Logo` is a 4-line image swap).

### PR #40 — `feature/logo-monograms` · 2026-05-17

Closes **chip #12**. Tiny polish PR — homepage FeaturedCompanies tiles were rendering a generic Building2 icon as the logo-fallback. The existing `<CompanyLogo>` component (used by `/companies` directory + `/company/[handle]` profile) already implements the "initials on a colored square" monogram with a 5-color palette deterministically picked from `companyId`. This PR replaces the homepage's bespoke fallback with that shared component.

**Result**: every demo company now shows a 2-letter initial monogram on the homepage (NC for Nimbus Cloud, SP for Sahaj Pay, VA for Veridian Analytics, etc.) in one of 5 calm pastel backgrounds. Visual consistency across `/`, `/companies`, and `/company/[handle]`.

No tests added — `initials()` and `pickColor()` are 4-line pure helpers inside `CompanyLogo.tsx`; the visual replacement is the test. Workspace typecheck 11/11, 181 web tests still green.

### PR #39 — `feature/demo-applications` · 2026-05-17

Closes **chip #11**. Recruiter dashboard's applicants list was empty post-PR-#35 (companies + jobs + recruiters seeded but no candidates / applications), so the recruiter side of the demo flow had nothing to show. This PR seeds the candidate funnel.

**What landed**:
- `packages/db/prisma/seed/demo-applications.ts` — 20 fictional Indian candidates spanning senior staff engineers down to fresh graduates + 2 non-tech roles (sales, editorial). Each candidate has a realistic headline, experience-in-months, current title, expected salary band (INR LPA), preferred cities, skill list, notice period.
- `packages/db/prisma/seed-demo-applications.ts` — entry point with the same prod-guard pattern as `seed-demo.ts` (refuses on `NODE_ENV=production` AND requires a local-looking `DATABASE_URL`, override via `ALLOW_DEMO_SEED_ON_REMOTE=true`).
- `pnpm db:seed:demo:apps` script + `db:seed:demo:full` extended to chain it.
- Stable User IDs 200001-200020 + `setval(pg_get_serial_sequence('"User"', 'id'), 200020)` so future real-user inserts don't collide (same lesson from PR #36's Job_id_seq fix).
- Idempotent: candidates upsert by email, candidate-profile upsert by userId. Applications wipe-and-reinsert per re-run so the distribution is deterministic and the recruiter dashboard doesn't bloat across reseeds.

**Application distribution** (deterministic per `(jobIndex, candidateIndex)` pair so re-runs are stable):
- 371 applications across 50 jobs (avg 7.4 apps/job)
- Status histogram: 211 APPLIED · 69 IN_REVIEW · 53 SHORTLISTED · 26 INTERVIEWED · 5 OFFERED · 2 HIRED · 3 REJECTED · 2 WITHDRAWN — matches a real recruiter's funnel shape
- Popular jobs (first 8 by id) get ~75% candidate-apply rate, tail jobs ~30%
- Intern jobs only get candidates with ≤2y experience
- ~25% of applications carry a one-line cover letter; the rest are bare

**Verified**: typecheck 11/11, `Application` table has 371 rows across all 50 demo jobs, `User` table has 20 demo candidates.

**Login credentials for demo** (same shared password): all candidates use `<firstname>.<lastname>+demo@jobportal.dev` with `DEMO_SEED_PASSWORD` (default `demo-recruiter-pass-2026!`). Combine with the 8 recruiter logins from PR #35 for full two-sided demo coverage.

### PR #38 — `feature/skill-city-landings` · 2026-05-17

Closes **chip #13** — restored the `/<skill>-jobs-in-<city>` SEO landings that PR #33 originally archived. Unblocked by PR #36's `[...path]` catch-all (the route was archived because Next 16's per-directory dynamic-segment uniqueness wouldn't resolve `[skill]-jobs-in-[city]` as a folder name; the catch-all absorbs the multi-token shape).

**Changes**:
- New 4th `dispatch` branch in `apps/web/lib/url/catch-all-dispatch.ts` matching `^([a-z0-9-]+)-jobs-in-([a-z0-9-]+)$` (with proper start/end anchors so `-jobs-in-` in the middle is unambiguous). 6 new unit tests covering the multi-word skill, multi-city, empty-skill / empty-city, and prefix-vs-marker matching order.
- New `apps/web/app/[...path]/_handlers/skill-city.tsx` — combined skill + city handler. Resolves skill via `prisma.skill.findUnique` + cities via the same multi-city `-and-` parser the city handler uses, then calls `searchJobs` with both `skillSlugs` and `citySlugs`. Breadcrumb via the pre-existing `skillCityBreadcrumb` helper. Canonical-sort guard for multi-city segments (404s if URL slugs aren't alphabetically sorted).
- Wired the new handler into `apps/web/app/[...path]/page.tsx` (both default export and `generateMetadata`).
- Restored the sitemap combo block in `apps/web/lib/seo/sitemap-shards.ts:144` — one extra `$queryRaw` for distinct `(primaryCityId, skillId)` pairs across ACTIVE jobs, then emits `/<skill>-jobs-in-<city>` for each valid pair. Re-checks `activeSkillIds` to drop orphan skill ids (defense; same approach as the existing `/<skill>-jobs` block).
- Un-skipped the 2 `.skip()`'d combo tests at `sitemap-shards.test.ts:178,206`.

**Verified live**: `/python-jobs-in-bangalore` 200, `/react-jobs-in-mumbai` 200, `/typescript-jobs-in-bangalore-and-pune` 200 (multi-city), `/nodejs-jobs-in-pune` 200 (matches seeded skill slug), `/figma-jobs-in-noida` 200, `/python-jobs-in-totally-bogus-city` 404 (city not in catalogue → notFound from handler — correct). `/sitemap/3.xml` (landings shard) now emits ~85 skill×city URLs for actual seeded combos.

**Test counts**: 16 files, **181 passed (0 skipped)** — was 173 passed + 2 skipped before. +8 new dispatch tests, +0 net change on sitemap tests (the 2 un-skipped tests replaced their `.skip()` status).

### PR #36 — `feature/demo-readiness` · 2026-05-17

Full QA sweep + fixes for the stakeholder demo. Pre-PR route audit found 8 broken URLs (404 / 500 / empty-results); post-PR all 25 probed routes serve cleanly. Closes **chip #5** (sitemap + SEO-landing 404s) and **chip #4 / part of #6** (route consolidation that unblocks restoring skill×city in a follow-up).

**4 commits** (plus the post-review fix commit):

1. **`fix(ui): Button asChild — conditional aria-* spread to fix React 19 hydration`** (a146620) — PR #34's review caught a hydration mismatch on every homepage load. Radix Slot 1.1.0 + React 19 render `aria-x={loading || undefined}` differently between server and client. Fix builds the slot props object conditionally and spreads — the attribute never enters the JSX tree unless truly true. Same output server + client.

2. **`fix(search,db): demo seed → ES indexing flow end-to-end`** (9158d6b) — three coupled fixes so `/jobs` and homepage actually serve seeded data:
   - **search:reindex env-loading race** — extracted `_load-env.ts` side-effect entry so `dotenv.config()` runs before the indexer chain pulls `@jobportal/db` (whose `client.ts` instantiates Prisma at module-eval time). Same shape as the apps/api/instrument.ts fix from PR #33.
   - **Demo seed Job IDs** — switched from `canonicalSlug = '<co>-<title>-d001'` (alphanumeric suffix) to explicit `Job.id` in the 100001-100050 range. `parseJobSlug` requires `-(\d+)$` at the tail; without this every `/job/<slug>` 404'd.
   - **`db:seed:demo:full` script** — chains seed + reindex so demo-day prep is one command.

3. **`fix(web): /sitemap.xml index handler + shard route handlers`** (ca4662c) — closes **chip #5 part 1**. Deleted the Next-metadata `app/sitemap.ts` (which only mounted shards, never an index) and replaced with two route handlers: `app/sitemap.xml/route.ts` for the `<sitemapindex>` and `app/sitemap/[shard]/route.ts` for the per-shard XML. Existing `getXxxUrls()` helpers in `lib/seo/sitemap-shards.ts` are unchanged. Test file lost 12 dead metadata-file tests, gained 7 new route-handler tests.

4. **`fix(web): catch-all dispatcher for SEO landings + company route consolidation`** (e03eb3c) — closes **chip #5 part 2**. Three coexisting root-level dynamic folders (`[skill]-jobs`, `jobs-in-[city]`, `working-at-[companyPath]`) consolidated under one `app/[...path]/page.tsx` that pattern-matches the URL shape and dispatches to handlers in `_handlers/`. Plus `app/company/[skill]-overview-[city]/page.tsx` → `app/company/[handle]/page.tsx` (same Next 16 multi-dynamic-segment-in-folder bug). Static routes still resolve first (Next 16 precedence: static > dynamic > catch-all), so `/jobs`, `/companies`, `/login` are unaffected.

**Post-review fixes (independent review caught 3 blockers)** (64cf3bc):
- **Postgres SERIAL sequence advance** — `prisma.job.create({ data: { id: 100001 } })` does NOT auto-advance `Job_id_seq`. The reviewer correctly flagged that the next real recruiter-portal job post on a demo-seeded DB would have collided on id=1 and kept colliding through id=100050. Added a `setval(pg_get_serial_sequence('"Job"', 'id'), 100050, true)` after the seed loop. Verified: `Job_id_seq.last_value = 100050` post-seed.
- **next.config.ts cache-control conflict** — the route handlers were setting `Cache-Control: ... s-maxage=3600`, but `next.config.ts` source rules for `/sitemap.xml` and `/sitemap/:path*` already set `s-maxage=86400`. Dropped the conflicting header from both handlers; config-side rule now owns the policy unambiguously.
- **Catch-all dispatcher had zero unit tests** — extracted the pure `dispatch()` function into `apps/web/lib/url/catch-all-dispatch.ts` and added 10 unit tests covering single-segment landings, multi-city `-and-` slugs, multi-word skill names, the prefix-vs-suffix matching order, deep-path null fallback, bare-prefix null fallback, and the unrelated-bogus null fallback.

**Verified live**: 25/25 routes (`/`, `/jobs`, all SEO landings, `/sitemap.xml` + shards, detail pages, auth pages, 404 fallback) return expected status codes against a cold dev server.

**Workspace state**: typecheck 11/11 green, 173 web tests (+10 from this PR), 2 still-skipped sitemap×city combo tests deferred to chip #13.

**Bookkeeping miss + recovery**: the PR-#36 commit author (me) forgot to include `PROGRESS.md` in the squash-merge — this entry ships in a separate `chore/update-progress-pr-36` follow-up branch per the CLAUDE.md §12 fallback protocol. (Per §12: "Best: bundle the update into the same PR." Next time, double-check `git status` before pushing the work PR.)

### PR #35 — `feature/demo-seed` · 2026-05-17

Closes follow-up chip #10. Makes the homepage and `/jobs` / `/companies` render against believable data so we can demo to stakeholders without scraping a competitor (would break Naukri/Indeed/LinkedIn ToS, risk IP-bans, and reproduce copyrighted content — CLAUDE.md §9). User explicitly chose the synthetic route over an Adzuna API integration when offered the choice.

**What shipped**:
- 12 fictional Indian companies across all 10 seeded industries — Nimbus Cloud Systems, Veridian Analytics, Sahaj Pay, Lumen Health, Pathshala Learning, Kirana Stack, Rasta Logistics, Margdarshi Media, Anvaya Realty, Tarang Hotels, Suchak Manufacturing, Sutra Labs. Each with industry, HQ city, employee count, founded year, description.
- 8 recruiters (User + Recruiter rows), one per top-hiring company, work-email pre-verified. Shared dev password (`demo-recruiter-pass-2026!` by default, overridable via `DEMO_SEED_PASSWORD=…` env var). Emails use `+demo@jobportal.dev` so they can be hard-deleted later via `LIKE '%+demo@%'`.
- 38 reviews distributed across all 12 companies (3-5 each), mix of positive/neutral/critical. `Company.averageRating` + `reviewCount` recomputed from canonical `CompanyReview` rows after insert so denorm + source-of-truth stay consistent.
- 50 ACTIVE jobs across the 12 companies, weighted toward Bangalore / Hyderabad / Mumbai / Pune / Delhi. Titles span fresher (0-1y) → Staff Engineer (15y+). Salaries in realistic INR LPA bands. Mix of ONSITE / REMOTE / HYBRID, FULL_TIME / INTERN / CONTRACTOR. Posted dates spread across the last ~30 days so the `postedWithin` filter has a believable distribution.

**Catalogue expansion**: extended `seed/skills.ts` from 100 → 160 skills covering data engineering (airflow, spark, dbt, snowflake), ML (machine-learning, mlops, computer-vision), CS fundamentals (algorithms, distributed-systems), product/design (product-management, ux-design, figma), and the cross-cutting soft / domain skills the demo's non-tech roles needed (operations, sales, editorial, journalism, journalism, risk-management, compliance, hospitality-management, culinary, manufacturing, six-sigma, CAD tooling, etc.). The pre-PR catalogue was tech-skewed; the expansion brings it closer to a real Indian job market.

**Safety**: distinct entry point `pnpm db:seed:demo` (separate from `pnpm db:seed`). Refuses to run when `NODE_ENV === 'production'`. Also refuses when `DATABASE_URL` doesn't match a local-host pattern (localhost / 127.0.0.1 / ::1 / `*.local` / `*.internal`), with `ALLOW_DEMO_SEED_ON_REMOTE=true` escape hatch. Idempotent — companies / recruiters / jobs upsert by canonical slug; reviews delete-and-reinsert per company.

**Bug found mid-PR and fixed in the same PR**: independent review caught that 16 of 50 jobs initially ended up with `skillIds = []` because the demo referenced 61 skill slugs that weren't in the seeded catalogue, plus two typos (`tailwind-css` vs `tailwindcss`, `android` vs `android-development`). Silently breaks the homepage's "popular skills" UNNEST ranking. Fixed by (a) extending the catalogue, (b) fixing the typos, (c) changing the demo's silent-drop behaviour to a loud `console.warn` so future drift is visible. After fix: 50/50 jobs have skillIds, avg 3.2 skills/job, 89 distinct skills used.

**Also from review**: tightened the prod guard (DATABASE_URL allowlist), allowed `DEMO_SEED_PASSWORD` env override for the shared password, moved `argon2` to `devDependencies` in `@jobportal/db` (seed-only — runtime consumers of `@jobportal/db` for the Prisma client don't need the native module).

**Not in this PR**:
- Candidate users / fake applications. Recruiter dashboard's applicants list will still be empty.
- Company `logoUrl` left null (real logos are copyrighted). FeaturedCompanies has a clean Building2 fallback.

Closes chip #10 in this file.

### PR #34 — `feature/homepage` · 2026-05-17

First real homepage, replacing the 7-line placeholder that had sat at `apps/web/app/page.tsx` since PR #1. Linear/Stripe/Vercel minimalism per CLAUDE.md §2 — oversized restrained type, one accent, hairline section dividers, bordered tiles with hover-border-color (no shadows), no gradients/illustrations/emoji. Structure borrowed from Naukri/Indeed/Glassdoor (which sections matter on a job-portal home page), visual idiom firmly rejected.

**Sections shipped** (top→bottom): `SiteHeader` → `Hero` (headline + live "X active roles today" pill + big `SearchInput` size="lg" + 2 muted CTAs) → `TrustStrip` (3 monochrome stats) → `PopularCitiesGrid` (top 12 by ACTIVE-job count) → `PopularSkillsGrid` (top 12) → `FeaturedCompanies` (top 8 by rating + openings count) → `RecentArticles` (3 PUBLISHED, reuses `ArticleCard`) → `RecruiterCta` → `SiteFooter`. All scoped to the homepage for now; promoting `SiteHeader`/`SiteFooter` to a shared layout is its own PR (touches every existing route's chrome).

**Data**: single `Promise.all` SSR fetch in `apps/web/lib/home/queries.ts`, `revalidate = 1800`. Top-skills uses raw `UNNEST(skillIds)` because Prisma's `groupBy` on array cols groups by whole-array value — re-using the PR #31 lesson. The pure `hydratePopularItems` transform is extracted and unit-tested in isolation (3 tests). **SearchInput** gained a `size: 'sm' | 'lg'` prop for the hero's larger variant; default stays `sm` so every other consumer is unaffected.

**Routing**: city/skill tiles link to `/jobs?city=<slug>` and `/jobs?skill=<slug>` (the working SRP with query filters) rather than the `/jobs-in-<slug>` / `/<slug>-jobs` SEO landings, because those 404 today per follow-up chip #5 (Next 16 Turbopack catch-all bug). Same Elasticsearch result set either way; swap to canonical landings in a one-line change per component when chip #5 lands.

**SEO**: `WebSite` + `SearchAction` JSON-LD on the homepage (Google sitelinks search box). Self-canonical via the root layout's `<CanonicalLink />`. Metadata title + description tuned for India-first positioning.

**Bug found mid-implementation**: the shared `Button` atom's `asChild` mode was rendering a 3-element `{leadingIcon}<span>{children}</span>{trailingIcon}` sandwich into `<Slot>`, which violates Radix Slot's `Children.only` assertion as soon as the asChild target has more than a bare text node inside. Crashed Hero / RecruiterCta / SiteHeader (all of which place an `ArrowRight` icon inside the `<Link>` child). **Shipped as its own commit** (de90d9f) — asChild now hands the caller-provided element straight to Slot; `leadingIcon`/`trailingIcon`/`loading` are documented as ignored in that mode. Verified via grep that no call site mixes `asChild` with the icon props today, so the change is strictly additive.

**Empty-state behaviour**: Cities/Skills/FeaturedCompanies all return `null` when their data arrays are empty, so the homepage degrades gracefully against the current dev seed (0 jobs / 0 companies / 0 recruiters — only 50 cities / 100 skills / 3 articles seeded). Components light up the moment seed expansion or real production data arrives.

**Also swept in this PR — three PR-#33 leftovers** that became visible while the homepage stress-tested the route graph:
1. Three SRP routes moved up a directory in PR #33 (out of the `(seo-jobs)` group) but kept the old 3-segment relative imports. Reduced to 2 segments in `apps/web/app/[skill]-jobs/page.tsx`, `apps/web/app/jobs-in-[city]/page.tsx`, `apps/web/app/company/[skill]-overview-[city]/page.tsx`.
2. `sitemap-shards.test.ts` asserted the pre-PR-#33 company-overview path; updated to `/company/<slug>-overview-<id>`.
3. Two skill×city sitemap tests `.skip()`'d with a code comment pointing at chip #6 — restore when the catch-all refactor lands.

**Three new follow-up chips opened**: (a) global `SiteHeader`/`SiteFooter` adoption across all routes, (b) auth-aware `SiteHeader` so authed users don't see "Sign in", (c) dev seed expansion (~5 companies + ~25 jobs) so the homepage's three "popular" sections render content in local development. None block release.

**Test counts**: +3 unit tests (home/queries). 163 total apps/web tests + 2 deliberately skipped (chip #6). Workspace typecheck 11/11 green.

**Post-review fix (cbe2351)**: independent review of the asChild rewrite caught a regression — the new branch destructured `disabled` from props and never re-emitted it, neutering `<Button asChild disabled={...}>` (the `/alerts` "New alert" button at quota cap was the visible case). Native `disabled` is meaningless on `<a>` (Slot's typical asChild target) so forwarding as-is wouldn't have worked anyway; the correct semantic is `aria-disabled` + `data-disabled`. Callers that need click suppression must still gate the inner `<Link>` href themselves.

### PR #33 — `chore/local-dev-runtime-fixes` · 2026-05-17

First end-to-end local boot of the full stack. Brought up Docker (Postgres 18 + Redis 8 + Elasticsearch 9.4) + API + web + recruiter, ran every public route and the candidate auth flow. Found and fixed 3 categories of issues in one sweep:

**SECURITY (HIGH)** — `/auth/me` was leaking `User.passwordHash` and `Session.refreshTokenHash` in the response body. The handler returned `prisma.user.findUnique({where:{id}})` and `prisma.session.findMany({where:...})` without a `select:`, so every field of both models hit the wire. Replaced both queries with explicit `select:` of only non-sensitive fields. Verified before/after via curl. Tagged this as the only real defect found during QA — every other failure was infrastructure/runtime.

**INFRASTRUCTURE**
- `apps/api` had no `.env` loader. Prisma's `@prisma/adapter-pg` reads `DATABASE_URL` at adapter construction time; with the env unset, every query failed with `SASL: client password must be a string`. Added `import 'dotenv/config'` as the very first line of `instrument.ts` (before Sentry init, which is itself before AppModule).
- The API `dev` script went through three iterations: `nest start --watch` couldn't resolve workspace TS packages at runtime (their `package.json` `main` points at `.ts` files); `tsx watch` dropped NestJS decorator metadata (DI silently injected `undefined` into AlertsScheduler.queueSvc); `ts-node` choked on the Prisma 7 generated client's ESM syntax in a CJS context. Settled on `node -r @swc-node/register src/main.ts` which handles both correctly.
- `nest-cli.json` gained `entryFile: "apps/api/src/main"` so `nest build` produces a discoverable entry path (defaults emit to `dist/apps/api/src/main.js` due to workspace package inclusion).
- Prisma schema gained `moduleFormat = "cjs"` on the client generator for consistent CJS interop.
- `.env` copied to `apps/web/` and `apps/recruiter/` so Next.js auto-load picks up DATABASE_URL etc.

**NEXT 16 COMPAT**
- Per-directory slug-name uniqueness rule rejected `[companyOverview]` + `[skill]-jobs-in-[city]` coexisting at root. Moved company route to `/company/<slug>-overview-<id>`. 11 call sites + the sitemap updated.
- `[skill]-jobs-in-[city]` (multi-token segment) hits a Turbopack invariant — archived to `_archived_routes/` (gitignored). Sitemap entry for that pattern commented out. Tracked as follow-up below.
- Moved `jobs-in-[city]` and `[skill]-jobs` out of the `(seo-jobs)` route group to the app root, working around a route-group + multi-token Turbopack quirk. The `(seo-jobs)` group is now empty save for `/jobs` and `layout.tsx`.
- Three client components (`Filters`, `SortSelect`, `SrpPaginationLink`) were importing from `lib/srp` barrel which re-exports `loadSrpUserContext` (server-only, touches Prisma). Turbopack dragged the chain into the client bundle. Replaced barrel imports with direct `lib/srp/params` imports.
- All six Sentry config files (3 web + 3 recruiter) now import `scrubSentryEvent` from `@jobportal/observability/scrub` (sub-path, no Prisma chain) instead of the barrel. Added explicit `exports` map to observability's `package.json`.
- `next.config.ts` gained `serverExternalPackages: ['argon2', '@prisma/client', '@prisma/adapter-pg', 'pg']` so webpack doesn't try to bundle native modules into the server runtime.

**TYPECHECK (pre-existing errors swept)** — `cookieEnvFromProcess`, `searchJobs.ts` ES SDK boundary, `feature-flags/api.ts` stripUndefined, `email-verification.service.ts` jwt cast, `SrpHrefInput`, `CanonicalLinkProps`, `FlagPatch`, `listAuditLog` opts. All under `exactOptionalPropertyTypes: true`. After fixes: `pnpm -w typecheck` is 11/11 green.

**Test counts**: 452 unit tests still green; no test regressions.

### PR #32 — `feature/observability` · 2026-05-17

Sentry + PostHog wiring — **closes Phase 1**. Four commits:

1. New `@jobportal/observability` package with SDK-agnostic scrubbers (URL + message + Sentry-event), `isTelemetryEnabled()` helper backed by the cached flag evaluator, and a new `killswitch.telemetry` seed flag. `.env.example` extended with `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
2. `@sentry/nestjs` on the API: `instrument.ts` as the very-first import, `SentryModule.forRoot()`, a global `SentryGlobalFilter` gated by killswitch.telemetry that skips 4xx HttpExceptions and forwards 5xx-class errors. All three BullMQ workers (transactional-emails, alerts, job-lifecycle) capture failures to Sentry with queue + jobId + attempts tags. Closes the PR #24 follow-up chip on terminal-DLQ alerting.
3. `@sentry/nextjs` + `posthog-js` on apps/web: per-runtime configs (client / server / edge), `instrumentation.ts` re-exports `captureRequestError as onRequestError`, `app/global-error.tsx` minimal recovery UI, `next.config.ts` wrapped with `withSentryConfig` for sourcemap upload (silent skip when SENTRY_AUTH_TOKEN blank), `lib/analytics/posthog.ts` lazy wrapper, `AnalyticsProvider` in root layout for user identify. Five hand-picked events wired (JOB_APPLY_CLICKED, JOB_SAVED/UNSAVED, JOB_ALERT_CREATED, SEARCH_PERFORMED, APPLICATION_WITHDRAWN) — `autocapture: false` deliberately, search records `queryLength` only (free-text can contain PII).
4. `@sentry/nextjs` on apps/recruiter: same shape as web minus PostHog (B2B funnel analytics deferred to Phase 2).

All Sentry config files use the new v10 `sourcemaps.deleteSourcemapsAfterUpload` option (was `hideSourceMaps` in v9). Build-time options conditionally added so `exactOptionalPropertyTypes: true` accepts blank env vars. Sentry's beforeSend hook everywhere routes through `scrubSentryEvent` to strip `?token=`/`?code=`/`?nonce=`/`?confirm=`/`?t=` from URLs and error messages before they leave the process.

Deliberately deferred: ISR Sentry replay (bandwidth-heavy), GDPR consent banner (needs legal review), `apps/services` Sentry (placeholder app, no real routes yet), `posthog-node` server events, custom Sentry dashboards (configured in Sentry UI), PostHog on recruiter. **21 new tests** (18 in @jobportal/observability + 3 in SentryGlobalFilter). 452 total tests passing.

### PR #31 — `feature/sitemap-and-seo` · 2026-05-08

Sharded sitemap + robots per SRS §4.15 — closes Phase 1 item 17. Two commits:

1. `robots.ts` (Next 16 metadata route) disallowing authenticated routes / auth flow pages / admin / API; sitemap reference at bottom. Cache-Control headers added in `next.config.ts` for `/sitemap.xml` (24h TTL, 48h SWR) and `/robots.txt` (7d TTL, 30d SWR). CLAUDE.md §6 noindex bullet expanded to enumerate the exact route prefixes that are gated.
2. Sharded sitemap using Next 16's `generateSitemaps` + default export. Shard layout: 0=static (homepage + /jobs + /companies + /career-advice), 1=companies (every seeded row gets both `/<slug>-overview-<id>` and `/working-at-<slug>-<id>`), 2=PUBLISHED articles, 3=SEO landings (skill / city / skill×city — combo expansion filtered via raw `UNNEST(skillIds)` to combos with ≥1 ACTIVE job to avoid thin-content pages), 4+=ACTIVE jobs at 40k per shard (50k Google ceiling minus 20% headroom). Per-row `lastModified = updatedAt` so changed content gets re-crawled.

Helpers extracted to `apps/web/lib/seo/sitemap-shards.ts` for testability.

Independent reviewer found two blockers + two discussion items, fixed in the same PR before merge: (1) **Next 16 sitemap signature** — `id` is now `Promise<string>`, not `number`; the original code would have silently fallen through every switch case and broken all shards at runtime. (2) **Offset pagination across shard regenerations** — `skip`/`take` over the ACTIVE-job set can drop or duplicate rows when status flips between cached shard fetches; switched to id-range pagination (`id BETWEEN N*40000 AND (N+1)*40000`) so each shard owns a deterministic id range that's stable across regenerations. (3) **`groupBy({by:['skillIds']})`** groups by whole-array values, not per-element; replaced with `SELECT DISTINCT UNNEST(...)`. (4) **Duplicate `prisma.city.findMany`** — folded into one query. Added a default-export integration test that exercises the Next 16 signature so a future regression is caught immediately.

Deliberately deferred: ISR pre-rendering of SEO landings (perf concern, not §4.15), Search Console auto-submission (one-time manual), image / news / video sitemaps. **29 sitemap tests + integration tests; 431 total unit tests; net-new TS errors: 0.**

### PR #30 — `chore/track-root-docs` · 2026-05-08

User reversed the local-only decision for the three root-level docs: `CLAUDE.md`, `README.md`, `SETUP_GUIDE.md` are now tracked and pushed to GitHub. `.gitignore` was simplified — only `/docs/` (which holds the SRS PDF and other strategy material) stays local. Verified beforehand that the three files contain no real secrets (only placeholder env names like `JWT_ACCESS_SECRET="dev-…replace-me"` and the docker-compose dev `POSTGRES_PASSWORD: jobportal` which is also already public in `infra/docker-compose.yml`). Future CLAUDE.md edits now travel with the repo, so the §12 read-PROGRESS.md-on-session-start protocol works for fresh checkouts too — not just the original dev machine.

### PR #28 — `chore/progress-tracking` · 2026-05-08

Added this file (`PROGRESS.md`) at the repo root and a corresponding rule in CLAUDE.md §12 (local-only) requiring it to be read at session start after CLAUDE.md, and updated immediately after any PR merges to develop. Initial content covered all 27 prior PRs, the Phase 1 16/18 progress, and 4 open follow-up chips. CLAUDE.md is gitignored so its rule changes stay on the user's local machine; the protocol still works because the developer with CLAUDE.md is the one running the session.

### PR #27 — `fix/admin-flag-real-actor` · 2026-05-08

Plumbs the JWT-derived `AccessClaims` (already attached to `req.user` by `AdminGuard`) through `@CurrentUser()` into the admin flag PATCH handler, replacing the `userId: 0` stub. Audit-log rows now record the real admin's userId. Reviewer-flagged matcher consistency nit also addressed in the same PR. Closes the runtime breakage introduced deliberately by PR #26. **6 controller tests, 232 API total.**

### PR #26 — `chore/setflag-actor-assertion` · 2026-05-08

Defense-in-depth at the `setFlag` storage boundary in `@jobportal/feature-flags`: the function now throws when `actor.userId <= 0 || actor.role !== 'ADMIN'` before any DB read. `Actor` type extended with optional `role: 'ADMIN'` literal. Deliberately broke the admin UI temporarily (until PR #27 plumbed the real actor) so a noisy 500 forced the follow-up rather than letting `changedById: 0` accumulate silently in the audit log. **5 new package tests, 37 feature-flags total.** README example updated.

### PR #25 — `feature/admin-feature-flags` · 2026-05-08

Admin console for feature flags per SRS §4.16 + §7.7. Six commits:
1. `GET /admin/feature-flags/audit-log` (paginated, `?flagKey=` filter, AdminGuard'd, null-tolerant user hydration).
2. `CachePurgeService.purgePaths()` + `pathsForFlag()` mapping wired into `FeatureFlagsService.update`.
3. `/admin` shell with `requireAdmin()` guard (404s on non-admin — no existence leak), Linear-style header + sidebar.
4. `/admin/feature-flags` table grouped by category, mono keys, semantic state Badge, search + state-filter pills, BOOLEAN inline Switch, critical-flag confirmation dialog with required reason.
5. Slide-over side panel handling all four advanced flag types (PERCENTAGE_ROLLOUT, USER_TARGETED, TIER_GATED, COHORT_TARGETED).
6. `/admin/audit-log` paginated viewer with one-line diff summary + click-to-expand raw JSON.

`isCriticalFlag()` refactored to prefix-match `killswitch.*` (fixed a quiet gap from PR #24 where `killswitch.transactional_emails` was missing from the explicit critical list). Reviewer-flagged: `setEqual` order-insensitive compare for tiers/user-IDs, server-side `reason` enforcement on critical flags, helpers extracted to `lib/admin/flag-edit-helpers.ts` for testability — all addressed before merge. **15 new tests across api + feature-flags + web.**

### PR #24 — `feature/notifications-and-email` · 2026-05-08

Transactional email pipeline per SRS §4.13. BullMQ queue (`transactional-emails`, 3 attempts, exponential backoff 1s→4s→16s) + sibling DLQ. Seven hand-rolled HTML templates sharing a `_layout.ts` shell (Inter font with system-ui fallback, single CTA, mandatory unsubscribe + plain-text alternate): registration_confirmation, email_verification, password_reset, application_submitted, application_status_change, job_posted_confirmation, payment_receipt. New `killswitch.transactional_emails` flag with three-layer enforcement (UI nudge / API 503 on resend endpoints / worker no-op). Per-user `EmailPreference` toggles via `/me/notifications` GET+PATCH and `/settings/notifications` UI. All 5 existing call sites migrated `send*` → `enqueue*`; 3 new sends wired (registration, application-submitted, job-posted-confirmation). Reviewer-flagged: 4 net-new TS errors + a registration-heading double-escape + 3 `void` enqueues — fixed before merge. **Two follow-up chips queued**: await DLQ insert (race window if API restarts mid-write), `scripts/redrive-dlq.ts` recovery script.

### PR #23 — `feature/recruiter-job-posting` · 2026-05-08

Recruiter posting + applicant management per SRS §4.9.3-7. Multi-step wizard at `/recruiter/jobs/new` (title → description → skills+locations → experience+salary → employment+work mode → review). New jobs go to `PENDING_MODERATION` if the moderation flag is on, else `ACTIVE`. On publish: ES index + cache invalidate + expiry schedule. Daily/monthly post quota (`feature.recruiter_post_quota`, TIER_GATED) with three-layer enforcement. `/recruiter/jobs` list + close/reopen. `/recruiter/jobs/{id}/applicants` with sort, status transitions, internal notes, signed resume URL. Reviewer fixes: applicants-page pagination + sort, dropped L1 quota guard (was rejecting draft saves), `quota.refund()` on tx failure, expiry sweep wired to cache purge, redundant findUnique removed. **47 new API unit tests.**

### PR #22 — `feature/recruiter-registration-and-shell` · 2026-05-08

Recruiter portal foundation per SRS §4.9.1-2. New `apps/recruiter` Next 16 app (port 3001). Registration + work-email verification via JWT-namespaced token (`${secret}:recruiter-work-email`). `Recruiter` model gains `workEmail` + `workEmailVerified` (separate from `User.email` login identifier). Authed shell with dashboard / jobs / profile pages + sidebar. `.catch()` instead of `void` on registration email send.

### PR #21 — `feature/career-advice-cms` · 2026-05-08

Career-advice CMS per SRS §4.8. Markdown processor with unified + remark + rehype + Shiki + sanitize (XSS-safe). `/career-advice` index + `/career-advice/[slug]` detail with `Article` + optional `FAQPage` JSON-LD. `Article` schema gains `ArticleStatus` enum + tags/faqs/coverImageUrl. Three sample articles seeded. `POST /api/revalidate/article` webhook for editor-triggered Next ISR invalidation.

### PR #20 — `feature/companies-directory-and-profiles` · 2026-05-08

Companies directory + profile pages per SRS §4.7. `/companies` directory page. `/[slug]-overview-[id]` company profile with `Organization` + `BreadcrumbList` JSON-LD, slug-drift 308 redirect to canonical URL. `/working-at-[slug]-[id]` CMS-managed life-at-company page. `CompanyReview` model + denorm fields on `Company`.

### PR #19 — `feature/application-tier-limits` · 2026-05-08

Three-layer application quota enforcement per SRS §4.11.16-17. `ApplicationQuotaService` with daily counter + tier resolver (FREE: 5/day, paid tiers: unlimited via `feature.unlimited_applications`). `RedisModule` + ioredis for atomic INCR + DECR-revert on failure. L1 (UI button-disable in JD page + dashboard sidebar daily-apply indicator), L2 (`POST /me/applications` 429 with friendly body), L3 (atomic consume). `GET /me/applications/quota` for the L2 hint. `ApplyButton` 429 surface. Reviewer fixes: PAST_DUE filter, rollback logging, L1 guard test.

### PR #18 — `feature/job-alerts-bullmq` · 2026-05-08

Job alerts per SRS §4.5. `JobAlert` schema with frequency (instant/daily/weekly), unsubscribe-token, dedupe state. `EmailPreference` lazily-provisioned table for category toggles. `/me/alerts` CRUD with 10-alert cap. BullMQ worker + email template (HTML + plain-text). Daily/weekly cron schedulers. Instant-fire indexer hook (when a new job is indexed in ES, scan matching alerts and enqueue). Public unsubscribe-token landing at `/alerts/unsubscribe/[token]`. `/alerts` list/create/edit + send-test endpoint. Reviewer fixes: schema drift, jobId stability, 403 test.

### PR #17 — `feature/saved-jobs-and-applications` · 2026-05-08

Apply + saved jobs + applications dashboard per SRS §4.2, §4.4, §4.6. Application state machine + email scaffold. `/applications` and `/saved-jobs` dashboards. Migration: `/saved-jobs` → `/me/saved-jobs`, `/applications` → `/me/applications` + list + withdraw. JobCard save toggle + repointed Save/Apply at `/me/*` endpoints.

### PR #16 — `chore/remove-stale-auth-state` · 2026-05-08

Cleanup: dropped orphan `apps/web/lib/job/auth-state.ts`. Zod 4 `.partial()` refinement crash + R2 orphan cleanup as bundled fix.

### PR #15 — `feature/user-profile-and-resume` · 2026-05-08

Candidate profile + resume per SRS §4.3. Schema for candidate + resume. R2 storage service (signed-URL upload + download) + ClamAV stub. `apps/api`: profile / education / experience / skills services + resume upload + flag-gated download per SRS §4.3.4 + CLAUDE.md §4. `apps/web`: `/profile` auth guard + layout + nav + editing pages + components. Three-layer flag gate for resume PDF download.

### PR #14 — `feature/job-detail-and-jsonld` · 2026-05-07

Job detail page per SRS §4.2 + §6.3. Server-side helpers, components, page itself with `JobPosting` JSON-LD. Slug-drift 308 redirect. JSON-LD extended with `experienceRequirements` + `url`. `<Script>` uses `afterInteractive` strategy. Open-redirect-safe `?next=` on login.

### PR #13 — `bugfix/feature-flags-audit-typecheck` · 2026-05-07

Type the audit-log `toJson` as `Prisma.InputJsonValue` per CLAUDE.md §10.

### PR #12 — `bugfix/auth-pages-design-system` · 2026-05-07

Re-skinned auth pages with `@jobportal/ui` atoms + theme tokens per CLAUDE.md §2 (Linear/Stripe minimalism).

### PR #11 — `bugfix/email-stub-redact-tokens` · 2026-05-07

Redacts one-time tokens (`?token=...`, `code`, `confirm`, `nonce`) from email-stub console logs per CLAUDE.md §9 (security: secrets must never be logged in cleartext).

### PR #10 — `bugfix/ui-use-theme-tsx-extension` · 2026-05-07

Renamed `use-theme.ts` → `use-theme.tsx` (JSX needs `.tsx`).

### PR #9 — `feature/job-search-srp` · 2026-05-07

Job search results page (SRP) per SRS §4.1, §6.1. `/jobs` + 3 SEO landing variants (`/jobs-in-[city]`, `/[skill]-jobs`, `/[skill]-jobs-in-[city]`). UI components: JobCard, FilterSidebar, SortSelect, MobileFilterSheet, SrpShell. SearchInput with 200ms debounced type-ahead per FR-4.1.7. `/api/search/suggest` endpoint. SRP params/breadcrumbs/JSON-LD helpers.

### PR #8 — `feature/url-architecture-middleware` · 2026-05-07

URL architecture per SRS §6. Slug parsers + builders (24 unit tests). URL normalize helpers + middleware-core composition (25 unit tests). Full middleware: case + slash + multi-city + query + flags. Canonical builder + `<CanonicalLink />` + JSON-LD builders. `next.config` image domains + legacy-redirect scaffold.

### PR #7 — `feature/elasticsearch-integration` · 2026-05-07

Elasticsearch 9 client + indexers per SRS §4.14 (CLAUDE.md §1 explicitly chose ES over Meilisearch). Bootstrap, reindex with alias swap, seed-fixtures, benchmark scripts.

### PR #6 — `feature/design-system` · 2026-05-07

`packages/ui` Tailwind 4 `@theme` tokens + atoms (Button, Badge, Input, Switch, Checkbox, etc.) + molecules (Dialog, Card, Tabs, etc.) per CLAUDE.md §2. Linear/Stripe minimal aesthetic.

### PR #5 — `feature/auth-jwt-system` · 2026-05-07

Custom JWT (HS256) + Argon2id + secure cookies per SRS §4.12. Access (15m) + refresh (30d) tokens with rotation on use. Cookie helpers, guards, throttle (5 failed login/min/IP). RolesGuard + `@CurrentUser`.

### PR #4 — `feature/feature-flag-system` · 2026-05-07

`@jobportal/feature-flags` package per SRS §7. L1 in-process LRU + L2 Redis cache. Pub/sub invalidation. 26 flags seeded OFF on Day 0. Three-layer enforcement (middleware / page / API). Slack notification on critical flag changes. Audit log every change.

### PR #3 — `feature/db-schema-and-prisma` · 2026-05-07

Prisma 7 schema per SRS §8: User, Candidate, Recruiter, Company, Job, Application, SavedJob, JobAlert, Article, FeatureFlag, FlagAuditLog, SubscriptionPlan, Subscription, SubscriptionInvoice, UserEntitlement, UsageRecord, Industry, City, Skill.

### PR #2 — `chore/local-infra` · 2026-05-07

Docker compose for local dev (Postgres 18, Redis 8, Elasticsearch 9).

### PR #1 — `feature/monorepo-scaffold` · 2026-05-07

Initial monorepo: pnpm workspaces + Turborepo. `apps/` (web, recruiter, services, api) + `packages/` (ui, db, search, auth, feature-flags, types). TS 5.9 strict, ESLint, Prettier, Husky.

---

## Open follow-up chips

These were spawned during reviews or QA but deferred. Pick one up when context next allows.

1. **Harden DLQ `recordTerminalFailure` to await** — `apps/api/src/email/transactional-email.queue.ts`. Sync BullMQ `failed` listener fires `recordTerminalFailure(...).catch(...)` which is fire-and-forget. If the API exits between attempt 3 failing and the DLQ insert acking, the failure is silently lost. Switch to async listener + `await`. **Source: PR #24 reviewer.** Note: partially mitigated by PR #32 — terminal failures also fire to Sentry now, so an API exit mid-write no longer means total blindness.
2. **`scripts/redrive-dlq.ts`** — drains the transactional-email DLQ back into the main queue. Standalone Node script. Optional `--dry-run` and `--max=N` flags. Doc comment in `transactional-email-dlq.queue.ts` already references this. **Source: PR #24 reviewer.**
3. **Refactor `ApplicationQuotaService` onto shared `tier-resolver`** — `apps/api/src/applications/quota.service.ts` still has its own tier-resolution helper; PR #23 extracted a shared one at `apps/api/src/common/tier-resolver.ts`. Migrate to dedupe. **Source: PR #23 reviewer.**
4. **Test `update()` triggering `firePublishSideEffects` for ACTIVE jobs** — `apps/api/src/recruiter-jobs/recruiter-jobs.service.test.ts`. Coverage gap from PR #23. **Source: PR #23 reviewer.**
5. **SEO landing routes — sitemap.xml index 404, `/jobs-in-bangalore` and `/python-jobs` return 404** — Next 16 / Turbopack appears to choke on certain combinations of multi-token segments at the same directory level. Discovered during PR #33 QA. Workarounds applied: archived `[skill]-jobs-in-[city]`, moved remaining SEO routes to app root. Need a clean refactor — either consolidate all SEO landings under a single `[...slug]` catch-all that parses internally, or move them under a `/jobs/` prefix. Sitemap helper has the skill×city block commented out pending the refactor. **Source: PR #33 QA.**
6. **Restore `[skill]-jobs-in-[city]` SEO landing** — currently archived to `_archived_routes/`. Re-introduce via the catch-all refactor in #5, or via a sub-path like `/jobs/<skill>-in-<city>/`. SRS §6 mentions this URL pattern. **Source: PR #33 QA.**
7. **Test BullMQ worker captureException on terminal failure** — `apps/api/src/email/transactional-email.queue.ts`. The Sentry-capture path on terminal DLQ failure was added in PR #32 but has no unit test. **Source: PR #32 reviewer.**
8. **Promote `SiteHeader` / `SiteFooter` to a shared layout** — homepage-scoped today (`apps/web/components/home/SiteHeader.tsx` + `SiteFooter.tsx`). Moving them into a real shared layout that every route opts into touches every existing page's chrome and the `app/layout.tsx` structure. **Source: PR #34.**
9. **Auth-aware `SiteHeader`** — the header currently shows "Sign in" for everyone, including authed users. Should read the JWT cookie (existing `readUserFromCookie()` helper) and flip "Sign in" → "Profile" when authed. Trivial change, but blocked on chip #8 — best done as part of the shared-layout move. **Source: PR #34.**
10. ~~**Expand dev seed with sample jobs / companies / recruiters**~~ — **CLOSED by PR #35**. Now ships 12 companies + 8 recruiters + 38 reviews + 50 jobs via `pnpm db:seed:demo`.
11. ~~**Seed fake candidate users + applications**~~ — **CLOSED by PR #39**. 20 candidates, 371 applications across 50 jobs with realistic status histogram.
12. ~~**Initials-monogram SVG generator for company logos**~~ — **CLOSED by PR #40**. The pre-existing `<CompanyLogo>` component already had this exact behavior; the homepage tiles just needed to use it instead of their bespoke Building2 fallback.
13. ~~**Restore `/[skill]-jobs-in-[city]` skill×city SEO landings**~~ — **CLOSED by PR #38**. 4th dispatch arm + handler + sitemap combo restored, 2 deferred tests un-skipped.

---

## Deliberately deferred (Phase 2 or out-of-scope)

Items intentionally NOT shipped in Phase 1, with justification. Don't pick these up without confirming with the user that we're crossing into Phase 2.

- **All paid features OFF on Day 0** per CLAUDE.md §0. Built-but-flagged: Services menu hidden, `/pricing` 404, all `services.*` flags `enabled: false`. The feature flag infrastructure (PR #4) is fully wired so individual features can be enabled in the admin console without a redeploy.
- **Stripe / Razorpay payment integration** — Phase 2. `payment_receipt` email template ships in PR #24 but has no caller until billing lands.
- **Subscription system end-to-end** — Phase 2. Schema exists (`SubscriptionPlan`, `Subscription`, `SubscriptionInvoice`, `UserEntitlement`, `UsageRecord` from PR #3) but no controllers / wizards / Stripe webhooks yet.
- **ResDex (recruiter candidate search)** — Phase 2. Flag `recruiter.resdex.enabled` exists.
- **Bulk recruiter messaging** — Phase 2. Flag `recruiter.bulk_messaging.enabled` exists.
- **AI features** (resume review, job match, interview) — Phase 2. Flags exist.
- **Bulk apply** — Phase 2 (TIER_GATED).
- **`@react-email` template engine** — out-of-scope. Hand-rolled HTML templates match the existing alerts pattern; revisit only if templates exceed ~10.
- **Slider primitive in `@jobportal/ui`** — out-of-scope. Number input is enough for the percentage rollout field; revisit if a second slider use case appears.
- **Branch protection rules on `main` / `develop`** — deliberate skip while solo per user memory; revisit when a collaborator joins or repo goes public.
- **Production release cut to `main`** — develop is stable but not yet released. Per CLAUDE.md §11, release is `git merge --no-ff develop` on `main` + tag, gated by user.

---

End of PROGRESS.md. Append a new "PR log" entry on every merge to develop; tick a Phase 1 box if the merge closes one.
