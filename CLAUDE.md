# JobPortal — Job Portal Platform
## Claude Code Master Context

> **CRITICAL — READ FIRST EVERY SESSION**
> This file is the permanent memory for this project. Claude Code loads it automatically on every session. Do NOT deviate from these constraints. The Software Requirements Specification at `docs/SRS.pdf` is the single source of truth for **what** to build. This file is the source of truth for **how**.

---

## 0. Project Identity

- **Name**: JobPortal
- **Type**: India-focused job-search and recruitment platform
- **Reference architecture (functionality only)**: Naukri.com — verified May 2026
- **UI/UX reference**: Big-tech minimal aesthetic (Linear, Stripe, Vercel, Notion). **Never** Naukri's cluttered/ad-heavy look.
- **Source of truth for features**: `docs/SRS.pdf` — always read the relevant section before implementing
- **Owner**: Prakash (solo developer, India)
- **Launch model**: Freemium — every paid feature ships OFF on Day 0

---

## 1. Locked Tech Stack — Latest Stable as of May 2026

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript (strict) | 5.9.x |
| Runtime | Node.js (Active LTS "Krypton") | 24.x |
| Frontend framework | Next.js (App Router, RSC, Turbopack) | 16.2.x |
| UI library | React | 19.2.x |
| Styling | Tailwind CSS (CSS-first config — see §2) | 4.2.x |
| Backend framework | NestJS | 11.x |
| ORM | Prisma (Rust-free Client) | 7.4.x |
| Database | PostgreSQL | 18.x |
| Search | **Elasticsearch** | 9.4.x |
| Cache + queue broker | Redis | 8.x |
| Background jobs | BullMQ | 5.76+ |
| Auth | Custom JWT (HS256) + Argon2id | — |
| Object storage | Cloudflare R2 (S3-compatible) | — |
| Email | Resend | latest |
| Payments | Stripe (primary) / Razorpay (alt) — Phase 2 | latest |
| Monorepo | pnpm workspaces + Turborepo | pnpm 10.x / Turbo 2.x |
| Frontend hosting | Vercel | — |
| Backend hosting | Render (or Fly.io) | — |
| Monitoring | Sentry + PostHog | latest |
| CDN + WAF + DNS | Cloudflare | — |

**Important note on search**: The SRS specifies **Meilisearch** for operational simplicity at MVP scale. We are explicitly using **Elasticsearch 9.x** instead, for long-term scalability matching the reference scale. Wherever the SRS says "Meilisearch" interpret it as "Elasticsearch" — index names and field schemas remain identical.

**Important note on Prisma 7**: Prisma 7 ships a Rust-free Client (the query compiler runs as a WebAssembly module on the JS main thread). This removes the native Rust binary deployment requirement of Prisma 5/6 — simpler edge/serverless deploys. Use `prisma.config.ts` (not the old `datasource db { url = env("...") }` pattern) for environment configuration; `.env` files are NOT auto-loaded — import `dotenv/config` in `prisma.config.ts` if needed.

**Important note on Tailwind 4**: Tailwind 4 is CSS-first. There is **no `tailwind.config.ts` file** anymore — design tokens live in CSS via `@theme` in your main stylesheet. Don't ask Claude Code to create a `tailwind.config.js/ts` — use `@theme` blocks instead.

**Forbidden / disallowed**: MongoDB, raw Express (use NestJS), JavaScript without types, NextAuth, Material UI, Ant Design, Bootstrap, Chakra, styled-components, Redux (use Zustand + TanStack Query). No `any` without a justification comment.

---

## 2. UI/UX Mandate — NON-NEGOTIABLE

The UI must **NOT** resemble Naukri.com. Naukri is cluttered, ad-heavy, and visually dated. Our product must look like a modern Big-Tech tool.

**Design references (mandatory inspiration)**:
- **Linear** (linear.app) — clarity, restraint, type system
- **Stripe** (stripe.com) — content density done right, trust
- **Vercel** (vercel.com) — geometry, whitespace, monochrome
- **Notion** (notion.so) — friendly without being childish
- **Meta / Google Material 3** — interaction patterns, accessibility

**Design principles (non-negotiable)**:
1. **Whitespace is a feature.** Generous padding. Never cram content.
2. **Typography hierarchy** via weight + size, not color. One font: Inter (variable).
3. **Restrained palette**: mostly neutrals (white/gray/black) + one accent + semantic (success/danger).
4. **No gradients** unless functional. **No drop shadows** except for elevation cues (modals, popovers).
5. **No emojis as UI elements.** No mascots. No cute illustrations. Calm and professional.
6. **Borders over shadows** for separation in flat surfaces.
7. **Animations**: 150–250ms, ease-out. No bouncy/playful motion.
8. **Mobile-first**, but desktop is the recruiter's primary device.
9. **Dark mode from day 1** (CSS variables via Tailwind 4 `@theme`).
10. **No ads on our own site** — ever. Period.

**Design tokens** (define in `packages/ui/src/styles/theme.css` using Tailwind 4 `@theme`):

```css
@import "tailwindcss";

@theme {
  /* Colors — OKLCH (Tailwind 4 default) */
  --color-primary: oklch(0.55 0.20 254);     /* restrained blue */
  --color-success: oklch(0.65 0.18 145);
  --color-danger:  oklch(0.60 0.22 25);

  /* Typography */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* Type scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48 */
  /* Weights: 400 / 500 / 600 / 700 */

  /* Radius: 6 / 8 / 12 — no pill buttons; default 8px */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
```

When generating UI, the test is: *would this look at home next to Linear and Stripe?* If no, redesign.

---

## 3. Architecture (Locked)

### 3.1 Monorepo layout
```
jobportal/
├── apps/
│   ├── web/          # Next.js 16 — job-seeker site (www subdomain)
│   ├── recruiter/    # Next.js 16 — recruiter portal (recruit subdomain)
│   ├── services/     # Next.js 16 — paid services site (resume/services subdomain)
│   └── api/          # NestJS 11 BFF (api subdomain)
├── packages/
│   ├── ui/           # Shared design system (Tailwind 4 theme, atoms, molecules)
│   ├── db/           # Prisma 7 schema + queries + seed
│   ├── search/       # Elasticsearch 9 client + indexers
│   ├── auth/         # JWT + Argon2id helpers
│   ├── feature-flags/# Backend-controlled flag system (★)
│   └── types/        # Shared TS types + Zod schemas
├── infra/
│   └── docker-compose.yml   # Local dev: postgres 18, redis 8, elasticsearch 9
├── docs/
│   ├── SRS.pdf       # Source of truth — DO NOT MODIFY
│   ├── architecture.md
│   ├── url-taxonomy.md
│   ├── ssr-csr-decisions.md
│   ├── subscription-system.md
│   ├── database-schema.md
│   ├── deployment.md
│   └── adr/          # Architecture Decision Records (one .md per decision)
├── .github/workflows/ci.yml
├── CLAUDE.md         # This file
├── README.md
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env.example
```

### 3.2 Service boundaries
- Frontends → API: HTTPS REST, fully typed via `@jobportal/types` Zod schemas
- API → DB: Prisma only (no raw SQL except `Prisma.sql` tagged templates)
- API → Elasticsearch: through `@jobportal/search` package only
- API → Redis: BullMQ for queues, ioredis for cache
- Webhooks (Stripe etc.): signature-verified, idempotent, IP-allowlisted

### 3.3 Path aliases
- `@jobportal/ui`, `@jobportal/db`, `@jobportal/search`, `@jobportal/auth`, `@jobportal/feature-flags`, `@jobportal/types`

---

## 4. Feature Flag System — MISSION CRITICAL (SRS §7)

**Every paid feature ships built but OFF on Day 0.** Admin enables features via `/admin/feature-flags` without a redeploy.

**Rules every Claude Code session must enforce**:
1. New paid/premium features land behind a flag (key naming: `services.X.enabled`, `feature.X`, `subscription.X`, `recruiter.X`, `killswitch.X`).
2. Flag evaluation goes through `@jobportal/feature-flags` — never inline `if (env.X)` or hardcoded checks.
3. Three-layer enforcement (all required):
   - **Layer 1**: Next.js middleware (route gate)
   - **Layer 2**: Page server component (`notFound()` if disabled)
   - **Layer 3**: API endpoint (last line of defense — non-bypassable)
4. Every flag change writes a `FlagAuditLog` row (before/after JSON, user, timestamp, reason).
5. Initial seed (per SRS §7.8) creates 26+ flags all with `enabled: false`.
6. **UI gating is for UX only. The API layer is the only trusted enforcement point.**

Flag types: `BOOLEAN`, `TIER_GATED`, `PERCENTAGE_ROLLOUT`, `USER_TARGETED`, `COHORT_TARGETED`. Evaluation logic in SRS §7.5.

---

## 5. URL Architecture (Locked per SRS §6)

Strict rules:
- Lowercase only
- Hyphen-separated words
- **Numeric ID always at end** (e.g., `/job/sales-executive-acme-12345`)
- Multi-value uses `-and-` separator, sorted alphabetically (`/jobs-in-bangalore-and-pune`)
- **No trailing slash** (`trailingSlash: false` in next.config)
- Slug drift → 301 redirect to canonical URL
- Self-referencing `<link rel="canonical">` on every page

Refer to SRS §6.1 for the complete pattern catalog. Every page has a Schema.org JSON-LD block where the SRS specifies it.

---

## 6. SEO Requirements (Non-negotiable)

- Every public page: SSR or SSG (no client-only SEO pages)
- Every page: `<link rel="canonical">`
- Job detail: `JobPosting` JSON-LD (validated in CI via Google Rich Results)
- Company page: `Organization` + `BreadcrumbList` JSON-LD
- Article page: `Article` + optional `FAQPage` JSON-LD
- SEO landing pages: `ItemList` + `BreadcrumbList`
- Sitemap auto-generated; sharded at 50k+ URLs (Next.js `generateSitemaps`)
- Closed/expired jobs: `<meta name="robots" content="noindex">`
- Auth pages, dashboard pages (`/profile/*`, `/applications`, `/saved-jobs`, `/alerts/*`, `/settings/*`), admin (`/admin/*`): `noindex`
- `robots.txt` (at `apps/web/app/robots.ts`) disallows the same set — defense-in-depth for well-behaved crawlers
- Sitemap (`apps/web/app/sitemap.ts`) only includes ACTIVE jobs + PUBLISHED articles + all companies + SEO landings with ≥1 ACTIVE job. Sharded at 40k per shard (50k Google ceiling)
- Cloudflare cache rules per SRS §4.2.10 / §4.7.6

---

## 7. Data Model (SRS §8)

Prisma schema lives at `packages/db/prisma/schema.prisma`. Reference SRS §8.2 for entity definitions. Key entities: `User`, `Candidate`, `Recruiter`, `Company`, `Job`, `Application`, `SavedJob`, `JobAlert`, `Article`, `FeatureFlag`, `FlagAuditLog`, `SubscriptionPlan`, `Subscription`, `SubscriptionInvoice`, `UserEntitlement`, `UsageRecord`, `Industry`, `City`, `Skill`.

**Migration discipline**:
- `prisma db push` is allowed **only** against local dev DB
- All other environments use `prisma migrate deploy`
- Breaking changes use **expand-then-contract**: add nullable column → backfill → switch reads → drop old
- Every migration reviewed in PR
- Prisma 7 uses `prisma.config.ts` for env configuration. Import `dotenv/config` at the top if you want `.env` loaded.

---

## 8. Performance Budgets (SRS §5.1)

| Metric | Target (p75) |
|---|---|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| First-load JS | < 150 KB gzipped |
| API p95 | < 300ms |
| SSR origin TTFB p75 | < 500ms |
| Search p95 | < 100ms |

Lighthouse CI runs on every PR. Regressions block merge.

---

## 9. Security Baselines (SRS §5.2)

- HTTPS-only, HSTS preload (max-age 2 years, includeSubDomains)
- Strict CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`
- Argon2id password hashing (memory ≥64MB, iterations ≥3)
- 15-min JWT access + 30-day refresh; refresh **rotated on every use**
- Cookies: `HttpOnly; Secure; SameSite=Lax`
- Zod validation at every API boundary — no untyped DTOs accepted
- Rate limiting (Cloudflare WAF + NestJS Throttler): public 100/min/IP, auth 1000/min/user, Resdex 10/min/user
- File uploads: MIME allowlist + size cap + ClamAV scan + signed-URL serving from R2
- Webhooks: signature verification + IP allowlist + idempotent
- Secrets in env vars only — **never committed**
- Admin role assigned only via direct DB write (never UI)

---

## 10. Code Standards

- **TypeScript 5.9 strict mode** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on
- **ESLint + Prettier** — pre-commit via Husky + lint-staged
- **File naming**: kebab-case for files, PascalCase for components, camelCase for utilities
- **Commit format**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`)
- **Commit body** must reference SRS section when implementing a feature: `feat(jobs): implement job search SRP per SRS §4.1`
- **PRs**: small, focused, single-purpose
- **Tests**: Vitest for units, Playwright for critical e2e (auth, apply, recruiter post, flag toggle)
- **Coverage target**: 80% on `packages/*`
- **ADR per major decision**: write a one-page `docs/adr/NNNN-title.md` (decision, context, consequences)

---

## 11. Branching Strategy

**Simplified Git Flow.** One branch per feature; feature branches are short-lived.

| Branch | Purpose | Branched from | Merges into |
|---|---|---|---|
| `main` | Production. Always deployable. | — | — |
| `develop` | Integration. Staging deploys from here. | `main` | `main` (release) |
| `feature/<name>` | One feature. | `develop` | `develop` |
| `bugfix/<name>` | Non-urgent fix. | `develop` | `develop` |
| `hotfix/<name>` | Production emergency. | `main` | `main` + `develop` |
| `chore/<name>` | Tooling, deps, docs-only. | `develop` | `develop` |

**Naming examples**:
- `feature/monorepo-scaffold`
- `feature/db-schema-and-prisma`
- `feature/auth-jwt-system`
- `feature/job-search-srp`
- `feature/job-detail-and-jsonld`
- `feature/feature-flag-system`
- `feature/recruiter-job-posting`
- `bugfix/canonical-redirect-edge-case`
- `hotfix/stripe-webhook-signature`

**Per-feature workflow**:

```bash
git checkout develop
git pull
git checkout -b feature/job-search-srp
# Work with Claude Code, commit small chunks
git add .
git commit -m "feat(jobs): scaffold SRP route per SRS §4.1"
# ... more commits
git push -u origin feature/job-search-srp
# Open PR on GitHub: feature/job-search-srp → develop
# CI runs. Review. Merge. Delete branch.
```

**Releasing to production** (when `develop` is stable and tested on staging):

```bash
git checkout main
git pull
git merge --no-ff develop -m "release: v0.x.0"
git tag v0.x.0
git push --follow-tags
```

**Rules Claude Code must enforce**:
1. Never commit directly to `main` or `develop` — always go through a `feature/`, `bugfix/`, `hotfix/`, or `chore/` branch.
2. Branch off the correct base: `feature/`, `bugfix/`, `chore/` from `develop`; `hotfix/` from `main`.
3. PRs target `develop` (except `hotfix/` which PRs to `main`, then back-merge to `develop`).
4. Branch names: lowercase, hyphen-separated, type-prefixed (no spaces, no camelCase, no underscores).
5. Keep feature branches short-lived (≤ ~1 week). Long-lived branches drift and create merge pain.
6. Before starting any branch, `git checkout develop && git pull` so the base is the latest integration tip.
7. After a successful merge, **do NOT delete the feature branch** — keep it on both local and remote (owner preference, set 2026-06-14, overrides the old "delete after merge" rule). Branches accumulate intentionally; the owner prunes them manually if/when desired.
8. Releases use `git merge --no-ff develop` on `main` (preserves the merge commit for traceability) + an annotated tag `vX.Y.Z`, pushed with `--follow-tags`.

---

## 12. Workflow Expectations for Claude Code

### Session start (every new session)

Before doing anything else on a new task:

1. **Read this file** (auto-loaded — already done).
2. **Read `PROGRESS.md`** at the repo root — current snapshot, last merged PR, open follow-ups, deliberate deferrals. This file is the running record of what has actually shipped to `develop`; reading it prevents re-deriving context from `git log` every session and prevents proposing work that has already shipped.
3. *Then* start the task.

If `PROGRESS.md` is missing, surface that — do NOT silently skip. Either the user wants you to recreate it (rare) or the repo is in an unexpected state worth flagging.

### When the user asks for a feature

1. **Session-start steps above** are already done.
2. **Read the relevant SRS section** in `docs/SRS.pdf`.
3. **Plan**: list files to create/modify, migrations needed, flags to add. Surface this plan before coding.
4. **Confirm with user** if the plan deviates from SRS, introduces new dependencies, or makes a decision worth recording as an ADR.
5. **Implement** in small commits on a feature branch.
6. **Update** related docs (ADR, URL taxonomy, schema notes) as a part of the same PR.
7. **Run** lint + typecheck + tests before declaring done.
8. **Reference the SRS section in commit messages**.

### Updating PROGRESS.md alongside the work

`PROGRESS.md` must be kept current. Two options, in order of preference:

1. **Best: bundle the update into the same PR as the work.** Just before the final commit of a feature/bugfix/chore branch, append a "## PR #N — `<branch>` · <date>" entry to `PROGRESS.md` (you'll know the PR number from `gh pr create`'s response — it's stable as soon as the PR opens). Tick the Phase 1 checkbox if applicable. Refresh the snapshot if the merge moves a headline number. Commit as part of the same PR. The docs and the code travel together; no follow-up cycle needed.

2. **Fallback: separate `chore/update-progress-pr-N` branch.** Only use this if you forgot during the work-PR or the PR was merged outside the conversation. Cut a chore branch from `develop`, make the same edits, PR it, merge. Per CLAUDE.md §11, **never commit directly to `develop`** — even for a one-line docs update.

Required content for the new entry:
- PR number, branch name, date.
- SRS section if any.
- Short paragraph: what shipped + any deferrals or follow-ups that came out of the review.

Do NOT batch progress updates across multiple PRs — update immediately while the context is fresh. If the PR was merged via the in-conversation `gh pr merge` flow, do this update before moving to the next task. If the user merged manually outside the conversation, treat the next session-start as the trigger.

**Exception**: a `chore/update-progress-pr-N` PR is itself bookkeeping — it does NOT trigger yet another progress update. The protocol applies to substantive work PRs (feature / bugfix / hotfix / non-progress chores), not to the docs-only progress updates that record them.

### When the user asks for "the next thing"

- Follow the **Phase 1 build order in §13 below** (sourced from SRS §12.1).
- Cross-check against `PROGRESS.md` to avoid re-suggesting an item that's already shipped.
- Suggest the next un-merged item and wait for user confirmation before starting.

### Per-task prompt template

The user opens new feature work with this template (treat as binding when you see it):

```
Implement <feature name> per SRS §<X.Y>. Branch from develop as feature/<short-name>.
Read the SRS section first and surface a plan (files to create, migrations, flags)
before coding. Reference SRS §X.Y in commit messages.
```

Examples the user has used:
- "Implement job search & SRP per SRS §4.1. Branch as `feature/job-search-srp`. Surface the file plan first."
- "Implement saved jobs per SRS §4.4. Reuse existing patterns from the apply flow."
- "Implement job alerts per SRS §4.5, including the BullMQ daily worker. Branch as `feature/job-alerts`."
- "Implement the recruiter portal job posting wizard per SRS §4.9. Branch as `feature/recruiter-job-posting`."
- "Implement the admin feature-flags page per SRS §4.16 and §7.7. Branch as `feature/admin-feature-flags`."

When the prompt arrives:
1. Read CLAUDE.md (auto-loaded) and the cited SRS section.
2. Cut `feature/<short-name>` from the latest `develop` tip per §11.
3. Surface a file/migration/flag plan in chat **before writing code**.
4. Wait for the user's go-ahead before implementing.
5. Commit in small chunks; reference the SRS section in commit messages.

### Drift correction phrases

The user may paste one of these to course-correct mid-task. Treat them as binding stop-and-redo instructions.

- **Wrong stack**: *"Re-read CLAUDE.md sections 1 and 2. We are NOT using `<wrong thing>`. Stay on the locked stack."* → Stop, re-read §1 + §2, swap the offending tech for the locked choice, restate plan before continuing.
- **Generic UI**: *"The UI is too `<adjective>`. Reference CLAUDE.md §2 — Linear/Stripe minimalism. Redo the visual design."* → Redo with restraint, generous whitespace, no gradients/shadows except for elevation, monochrome + one accent, no emoji UI.
- **Missing flag**: *"This paid feature must be flag-gated per CLAUDE.md §4 and SRS §7. Add the flag and three-layer enforcement."* → Add the flag key, the `FlagAuditLog` row, and Layer 1 (middleware) + Layer 2 (page server component) + Layer 3 (API endpoint) gates. UI gating alone is not enough.

**Never**:
- Deviate from the locked tech stack or version constraints
- Skip feature-flag wiring on a paid feature
- Commit secrets or `.env` files
- Use `any` without a justification comment
- Style components to look like Naukri (use the references in §2)
- Implement frontend-only paid feature gating
- Run `prisma db push` against staging or production
- Disable TypeScript strict mode
- Add a new top-level dependency without flagging it for review
- Create a `tailwind.config.ts` (Tailwind 4 is CSS-first)
- Downgrade any tech to an older major version

---

## 13. Phase 1 Build Order (per SRS §12.1)

Phase 1 — Freemium MVP (Months 0–3). Recommended order of feature branches; ship one PR at a time and merge to `develop` before starting the next.

1. `feature/monorepo-scaffold`
2. `feature/db-schema-and-prisma` (SRS §8)
3. `feature/feature-flag-system` (SRS §7) — build this **early**; every paid feature depends on it
4. `feature/auth-jwt-system` (SRS §4.12)
5. `feature/design-system` (`packages/ui` Tailwind 4 `@theme` + atoms — Linear/Stripe vibes per §2)
6. `feature/elasticsearch-integration` (SRS §4.14)
7. `feature/job-search-srp` (SRS §4.1, §6.1 URL patterns)
8. `feature/job-detail-and-jsonld` (SRS §4.2, §6.3)
9. `feature/user-profile-and-resume` (SRS §4.3)
10. `feature/apply-and-saved-jobs` (SRS §4.2, §4.4)
11. `feature/job-alerts-bullmq` (SRS §4.5)
12. `feature/application-tracking` (SRS §4.6)
13. `feature/companies-directory` (SRS §4.7)
14. `feature/career-advice-cms` (SRS §4.8)
15. `feature/recruiter-portal` (SRS §4.9)
16. `feature/admin-console` (SRS §4.16)
17. `feature/sitemap-and-seo` (SRS §4.15)
18. `feature/observability` (Sentry + PostHog wiring)

**Phase 1 success criteria**: 10k MAU · top-3 Google rank for "{city} jobs" in 5 cities · 60% of LCP samples under 2.5s.

**Phase 1 paid features**: built but **DISABLED**. The whole subscription system ships built-but-OFF — the Day-0 user experience is 100% free, the Services menu is hidden, `/pricing` returns 404 (CLAUDE.md §0).

When the user asks for "the next thing", suggest the next un-merged item in this list and wait for confirmation.

---

## 14. Memory Anchors (Do Not Forget)

- **Project name**: **JobPortal** (not "YourPortal", not anything else)
- **Path alias prefix**: `@jobportal/*`
- **Freemium-on-launch**: Day-0 user experience is 100% free. The Services menu is hidden. `/pricing` returns 404.
- **Solo developer**: prefer pragmatic over perfect. Suggest tradeoffs.
- **India market**: INR only at launch. Indian English idioms acceptable.
- **Reference site = Naukri.com for functionality**, big-tech minimal for look/feel.
- **Search = Elasticsearch 9**, despite SRS saying Meilisearch.
- **Prisma 7 is Rust-free** — no native binary, simpler deploys.
- **Tailwind 4 is CSS-first** — no JS config file.
- **Architectural decisions worth keeping go in `docs/adr/`**.
- **Phase 1 first**: SRS §12.1. Don't enable monetization features until Phase 2 (Months 3–6).

---

End of CLAUDE.md. The SRS is the source of truth for **what**; this file is the source of truth for **how**. When in doubt, ask the user before deviating.
