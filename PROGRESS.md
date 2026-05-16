# JobPortal — Progress Log

> **Purpose**: Running record of what has actually shipped to `develop`. Read after `CLAUDE.md` at the start of every new session so you have current context without re-deriving it from `git log`.
>
> **What this file IS**: cumulative shipped work, currently-in-flight branches, queued follow-ups, deliberate deferrals.
>
> **What this file is NOT**: the SRS (`docs/SRS.pdf` is the source of truth for *what* to build), the project rules (`CLAUDE.md` is the source of truth for *how*), or a TODO list for new work.
>
> **Update protocol**: after a feature/bugfix/chore PR is merged to `develop`, append a new entry under "PR log" and tick the relevant box in "Phase 1 build order" if applicable. Keep the snapshot at the top fresh.

---

## Snapshot — 2026-05-08

- **Current phase**: Phase 1 — Freemium MVP (CLAUDE.md §13).
- **Phase 1 progress**: **17 of 18** build-order items merged. Remaining: observability (Sentry + PostHog).
- **Branch state**: `develop` is the integration tip (31 PRs merged); `main` is still the initial scaffold (no production release cut yet).
- **Last merge**: PR #31 — `feature/sitemap-and-seo` (sharded sitemap + robots.txt per SRS §4.15).
- **Test counts on develop**: 232 API + 152 web + 37 feature-flags = 421 unit tests, all green.
- **Locked stack as of CLAUDE.md §1**: Next 16.2 / React 19.2 / Tailwind 4.2 / NestJS 11 / Prisma 7.4 / Postgres 18 / Elasticsearch 9.4 / Redis 8 / BullMQ 5.76 / Resend / R2.

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
- [ ] **18. observability** — TODO. Sentry + PostHog wiring per CLAUDE.md §1 stack list.

**Bonus shipped (not in original Phase 1 list but landed early)**: notifications + transactional email (PR #24, SRS §4.13).

---

## PR log

Most recent first. Each entry: PR number, branch, SRS section, one-paragraph summary of what was actually shipped, plus any deliberate deferrals or follow-ups.

### PR #31 — `feature/sitemap-and-seo` · 2026-05-08

Sharded sitemap + robots per SRS §4.15 — closes Phase 1 item 17. Two commits:

1. `robots.ts` (Next 16 metadata route) disallowing authenticated routes / auth flow pages / admin / API; sitemap reference at bottom. Cache-Control headers added in `next.config.ts` for `/sitemap.xml` (24h TTL, 48h SWR) and `/robots.txt` (7d TTL, 30d SWR). CLAUDE.md §6 noindex bullet expanded to enumerate the exact route prefixes that are gated.
2. Sharded sitemap using Next 16's `generateSitemaps` + default export. Shard layout: 0=static (homepage + /jobs + /companies + /career-advice), 1=companies (every seeded row gets both `/<slug>-overview-<id>` and `/working-at-<slug>-<id>`), 2=PUBLISHED articles, 3=SEO landings (skill / city / skill×city — combo expansion filtered via raw `UNNEST(skillIds)` to combos with ≥1 ACTIVE job to avoid thin-content pages), 4+=ACTIVE jobs at 40k per shard (50k Google ceiling minus 20% headroom). Per-row `lastModified = updatedAt` so changed content gets re-crawled.

Helpers extracted to `apps/web/lib/seo/sitemap-shards.ts` for testability; 19 unit tests cover shard-ID layout, ACTIVE/PUBLISHED filtering, shard-count math (zero / one / boundary / over-boundary), the `UNNEST` combo filter, and orphan ID defense.

Deliberately deferred: ISR pre-rendering of SEO landings (perf concern, not §4.15), Search Console auto-submission (one-time manual), image / news / video sitemaps. **421 total unit tests; net-new TS errors: 0.**

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

These were spawned during reviews but deferred. Pick one up when context next allows.

1. **Harden DLQ `recordTerminalFailure` to await** — `apps/api/src/email/transactional-email.queue.ts`. Sync BullMQ `failed` listener fires `recordTerminalFailure(...).catch(...)` which is fire-and-forget. If the API exits between attempt 3 failing and the DLQ insert acking, the failure is silently lost. Switch to async listener + `await`. **Source: PR #24 reviewer.**
2. **`scripts/redrive-dlq.ts`** — drains the transactional-email DLQ back into the main queue. Standalone Node script. Optional `--dry-run` and `--max=N` flags. Doc comment in `transactional-email-dlq.queue.ts` already references this. **Source: PR #24 reviewer.**
3. **Refactor `ApplicationQuotaService` onto shared `tier-resolver`** — `apps/api/src/applications/quota.service.ts` still has its own tier-resolution helper; PR #23 extracted a shared one at `apps/api/src/common/tier-resolver.ts`. Migrate to dedupe. **Source: PR #23 reviewer.**
4. **Test `update()` triggering `firePublishSideEffects` for ACTIVE jobs** — `apps/api/src/recruiter-jobs/recruiter-jobs.service.test.ts`. Coverage gap from PR #23. **Source: PR #23 reviewer.**

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
