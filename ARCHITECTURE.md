# JobPortal — Architecture & Project Flow

> **Audience:** Every developer on the team. Read this once before you write code.
> **Goal:** Give you an accurate mental model of *what* the system is, *how* the pieces fit together, and *where* your code belongs.
>
> This document describes architecture. For setting up your machine see **[ONBOARDING.md](./ONBOARDING.md)**; for the day-to-day git workflow see **[DEVELOPMENT.md](./DEVELOPMENT.md)**; for the binding engineering rules see **[CLAUDE.md](./CLAUDE.md)**.

---

## 1. What JobPortal is

JobPortal is an **India-focused job-search and recruitment platform** — functionally comparable to Naukri.com, but with a deliberately calm, modern UI (think Linear / Stripe, never Naukri's cluttered look).

- **Business model:** Freemium. Every paid feature is *built but switched OFF* on day one via the feature-flag system. The launch experience is 100% free.
- **Current status:** Phase 1 (Freemium MVP) is functionally complete. The product has not yet been released to production (`main` is still the scaffold; all work lives on `develop`).
- **Market:** India-first. INR only at launch.

---

## 2. The 30-second mental model

```
                        ┌─────────────────────────────────────────┐
   Job seekers  ─────▶  │  apps/web        (Next.js 16, :3000)     │
   Recruiters   ─────▶  │  apps/recruiter  (Next.js 16, :3001)     │ ──┐
   Paid services ────▶  │  apps/services   (Next.js 16, :3002)     │   │  HTTPS REST
                        └─────────────────────────────────────────┘   │  (typed via
                                                                       │   Zod schemas)
                                                                       ▼
                        ┌─────────────────────────────────────────┐
                        │  apps/api   (NestJS 11 BFF, :4000)        │
                        │  the ONLY trusted enforcement layer       │
                        └───────┬───────────┬───────────┬──────────┘
                                │           │           │
                        Prisma 7│   @jobportal/search   │ BullMQ / ioredis
                                ▼           ▼           ▼
                        ┌──────────┐ ┌─────────────┐ ┌─────────┐
                        │ Postgres │ │Elasticsearch│ │  Redis  │
                        │   :5432  │ │    :9200    │ │  :6379  │
                        └──────────┘ └─────────────┘ └─────────┘
```

- The **frontends** render UI and talk only to the API over typed REST.
- The **API (BFF — Backend-for-Frontend)** owns all business logic and is the single source of truth for security and feature-flag enforcement.
- **Postgres** is the system of record. **Elasticsearch** powers job/company/article search. **Redis** backs caching and the BullMQ job queues.

> Everything is a **monorepo** managed with pnpm workspaces + Turborepo. Shared logic lives in `packages/*` and is imported by the apps via `@jobportal/*` aliases.

---

## 3. The locked tech stack

These versions are **locked** by [CLAUDE.md §1](./CLAUDE.md). Do not upgrade majors or swap technologies without owner sign-off.

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript (strict) | 5.9.x |
| Runtime | Node.js (Active LTS "Krypton") | 24.x |
| Frontend | Next.js (App Router, RSC, Turbopack) | 16.2.x |
| UI library | React | 19.2.x |
| Styling | Tailwind CSS (CSS-first, **no** `tailwind.config.ts`) | 4.2.x |
| Backend | NestJS | 11.x |
| ORM | Prisma (Rust-free client) | 7.4.x |
| Database | PostgreSQL | 18.x |
| Search | **Elasticsearch** (chosen over the SRS's Meilisearch) | 9.4.x |
| Cache + queue broker | Redis | 8.x |
| Background jobs | BullMQ | 5.76+ |
| Auth | Custom JWT (HS256) + Argon2id | — |
| Object storage | Cloudflare R2 (S3-compatible) | — |
| Email | Resend | latest |
| Monorepo | pnpm workspaces + Turborepo | pnpm 10 / Turbo 2 |
| Monitoring | Sentry + PostHog | latest |

**Forbidden / disallowed:** MongoDB, raw Express (use NestJS), JavaScript without types, NextAuth, Material UI / Ant / Bootstrap / Chakra, styled-components, Redux (use Zustand + TanStack Query), and `any` without a justification comment.

---

## 4. Monorepo layout

```
jobportal/
├── apps/
│   ├── web/          # Next.js 16 — job-seeker site            (port 3000)
│   ├── recruiter/    # Next.js 16 — recruiter portal           (port 3001)
│   ├── services/     # Next.js 16 — paid services site         (port 3002)
│   ├── sadmin/       # Next.js 16 — internal Super Admin portal (port 3003, basePath /sadmin)
│   └── api/          # NestJS 11 — BFF for all clients         (port 4000)
├── packages/
│   ├── ui/           # Shared design system (Tailwind 4 @theme + components)
│   ├── db/           # Prisma 7 schema, client, queries, seeds
│   ├── search/       # Elasticsearch 9 client, mappings, indexers
│   ├── auth/         # JWT (HS256) + Argon2id helpers
│   ├── feature-flags/# Backend-controlled feature-flag system
│   ├── types/        # Shared TypeScript types + Zod schemas
│   └── observability/# Sentry + PostHog scrubbers + helpers
├── infra/
│   └── docker-compose.yml   # Local Postgres 18 + Redis 8 + Elasticsearch 9.4
├── docs/             # LOCAL-ONLY (gitignored) — SRS.pdf + research notes
├── CLAUDE.md         # Engineering rules — the source of truth for "how"
├── ARCHITECTURE.md   # This file
├── ONBOARDING.md     # New-machine setup guide
├── DEVELOPMENT.md    # Branching + daily workflow
├── PROGRESS.md       # Running log of everything shipped to develop
├── README.md
├── turbo.json
├── pnpm-workspace.yaml   # workspaces: apps/*, packages/*
└── tsconfig.base.json
```

> **Important:** the `docs/` folder is **gitignored**. It holds the SRS PDF and strategy material that stays off GitHub. Any documentation that the team needs on clone (like this file) lives at the **repo root**, which *is* tracked.

---

## 5. The apps (frontends + API)

### 5.1 `apps/web` — Job-seeker site (port 3000)
The public-facing product. Job search, job detail pages, company profiles, career-advice articles, candidate profile/resume, saved jobs, applications, job alerts. Almost every page here is **SSR/SSG for SEO** (see §9).

### 5.2 `apps/recruiter` — Recruiter portal (port 3001)
Where recruiters register (with work-email verification), post jobs through a wizard, and manage applicants. Separate Next.js app on its own subdomain.

### 5.3 `apps/services` — Paid services site (port 3002)
Placeholder for Phase-2 paid services (resume writing, etc.). Minimal today; the Services menu is hidden and `/pricing` 404s while the freemium gate is on.

### 5.4 `apps/sadmin` — Internal Super Admin portal (port 3003, basePath `/sadmin`)
Staff-only console for operating the platform: reviewing and approving job posts, processing recruiter business verification (KYC), handling support tickets. Today it ships the sign-in page and a dashboard of platform totals.

Two things make it different from the other frontends:
- **It is the only app with a `basePath`** (`/sadmin`), set on one line of `next.config.ts`. Application code never writes the prefix — Next applies it — with one exception worth knowing: `next/image` does **not** prefix a string `src`, so local images use static imports (see `components/brand/Logo.tsx`).
- **Access is role-only, not flag-gated.** Admin surfaces in this repo are deliberately never behind a killswitch (killing the console is the opposite of what you want during an incident). The gate is `requireSuperAdmin()` in the `(authed)` layout plus `AdminGuard` on any API route it calls. Sign-in goes through **`POST /auth/admin/login`**, which rejects non-`ADMIN` accounts *after* verifying the password so it cannot be used to discover which addresses are admins.

The `ADMIN` role is assigned only by the seed or a direct DB write — never through a UI (CLAUDE.md §9).

### 5.5 `apps/api` — NestJS BFF (port 4000)
The brain. Every frontend calls this over typed REST. It is the **only trusted layer**:
- **Database:** Prisma only — no raw SQL except `Prisma.sql` tagged templates.
- **Search:** through the `@jobportal/search` package only.
- **Cache + queues:** BullMQ for queues, ioredis for caching.
- Hosts the three **BullMQ background workers** in-process (see §10).

> **Why a BFF and not direct DB access from Next.js?** A single backend means one place to enforce auth, validation (Zod at every boundary), rate-limiting, and feature flags. Frontends stay thin and never hold secrets or trust client input.

---

## 6. The shared packages

Every package is consumed via its `@jobportal/<name>` alias. Put logic here when **more than one app** needs it.

| Package | Alias | Responsibility |
|---|---|---|
| `ui` | `@jobportal/ui` | Design system — Tailwind 4 `@theme` tokens (OKLCH colors, Inter font), plus atoms (Button, Input, Badge…) and molecules (Dialog, Accordion, Card…). |
| `db` | `@jobportal/db` | Prisma 7 schema (`packages/db/prisma/schema.prisma`), the generated client, query helpers, and all seed scripts. |
| `search` | `@jobportal/search` | Elasticsearch 9 client, index mappings, indexers for jobs/companies/articles, and the `searchJobs` query layer. |
| `auth` | `@jobportal/auth` | JWT (HS256) token issue/verify, Argon2id password hashing, secure-cookie helpers. |
| `feature-flags` | `@jobportal/feature-flags` | The flag evaluator (pure, no I/O), flag keys, and the five flag types. |
| `types` | `@jobportal/types` | Shared TypeScript types + Zod schemas used at every API boundary. |
| `observability` | `@jobportal/observability` | App-agnostic Sentry/PostHog scrubbers + a `isTelemetryEnabled` check. |

---

## 7. Data model (Postgres via Prisma)

The schema lives at **`packages/db/prisma/schema.prisma`**. Core entities:

| Entity | Role |
|---|---|
| `User` | Account + role (`CANDIDATE` / `RECRUITER` / `ADMIN`). |
| `Candidate` | Job-seeker profile attached to a User. |
| `Recruiter` | Recruiter profile (single Email ID = `User.email`; `workEmailVerified` gates job posting). |
| `Company` | Employer record (slug, industry, HQ city, denormalized rating). |
| `Job` | A posting (status: `DRAFT`/`PENDING_MODERATION`/`ACTIVE`/`EXPIRED`/`CLOSED`). |
| `Application` | A candidate's application to a job, with a status state machine. |
| `SavedJob` | Candidate bookmarks. |
| `JobAlert` | Saved searches that email new matches (instant/daily/weekly). |
| `Education`, `WorkExperience`, `Resume` | Candidate profile sub-records. |
| `Article` | Career-advice CMS content (status: draft/published). |
| `Industry`, `City`, `Skill` | Reference taxonomies used across search + filters. |
| `FeatureFlag`, `FlagAuditLog` | Flag definitions + an audit row per change. |
| `SubscriptionPlan`, `Subscription` | Sellable plans (audience: CANDIDATE / RECRUITER) + enrolments. Recruiter subscriptions are **company-scoped** (`Subscription.companyId`): one purchase entitles the whole team via `resolveRecruiterTier`. Candidate side remains dormant. |
| `SubscriptionInvoice`, `PaymentOrder`, `PaymentWebhookEvent`, `CompanyBillingProfile` | Recruiter billing: GST invoice records (FY-sequential number, CGST/SGST/IGST breakup, private PDF), one row per Razorpay Checkout attempt, the webhook idempotency ledger, and the company's GST billing identity. |
| `UserEntitlement`, `UsageRecord` | Phase-2 monetization scaffolding (built, dormant). |
| `Session` | Stores `sha256(jti)` for refresh-token rotation (raw token never stored). |

**Migration discipline:** `prisma migrate dev` for local development only; all other environments use `prisma migrate deploy`. Breaking changes follow expand → backfill → contract. Never run destructive migrations against a shared DB.

---

## 8. Feature-flag system (mission critical)

**Every paid/premium feature ships behind a flag, OFF by default.** An admin enables a feature at runtime — no redeploy. There are 26+ flags, all seeded `enabled: false`.

Flag evaluation must go through `@jobportal/feature-flags` — never an inline `if (env.X)`.

**Three-layer enforcement (all required for a gated feature):**
1. **Layer 1 — Next.js middleware:** route gate (redirect/404 when off).
2. **Layer 2 — page server component:** `notFound()` when off.
3. **Layer 3 — API endpoint:** the last, non-bypassable line of defense.

> **UI gating is UX only. The API layer is the only trusted enforcement point.** Every flag change writes a `FlagAuditLog` row (before/after JSON, actor, timestamp, reason).

Flag types: `BOOLEAN`, `TIER_GATED`, `PERCENTAGE_ROLLOUT`, `USER_TARGETED`, `COHORT_TARGETED`. Flag-key naming: `services.X.enabled`, `feature.X`, `subscription.X`, `recruiter.X`, `killswitch.X`.

---

## 9. URLs & SEO (why pages are server-rendered)

SEO is a first-class requirement; structure is locked in [CLAUDE.md §5–§6].

- **URL rules:** lowercase, hyphen-separated, **numeric ID always at the end** (e.g. `/job/sales-executive-acme-12345`); multi-value uses `-and-` (alphabetically sorted); no trailing slash; slug drift → 301 to canonical; self-referencing `<link rel="canonical">` on every page.
- **Rendering:** every public page is SSR or SSG — no client-only SEO pages.
- **Structured data (JSON-LD):** `JobPosting` on job detail, `Organization` + `BreadcrumbList` on company pages, `Article` (+ optional `FAQPage`) on articles, `ItemList` + `BreadcrumbList` on SEO landing pages.
- **Sitemap:** auto-generated and sharded (static / companies / articles / SEO landings, then job shards at 40k each).
- **noindex:** closed/expired jobs and all authed/admin routes (`/profile/*`, `/applications`, `/saved-jobs`, `/alerts/*`, `/settings/*`, `/admin/*`).

---

## 10. Auth & background jobs

### Authentication
- **JWT (HS256):** 15-minute access token + 30-day refresh token. The refresh token is **rotated on every use**.
- **Passwords:** Argon2id (memory ≥64 MB, iterations ≥3).
- **Cookies:** `HttpOnly; Secure; SameSite=Lax`. The refresh cookie is scoped to `/auth`.
- **Sessions:** the DB stores `sha256(jti)`, never the raw token.
- **Admin** role is assigned only via direct DB write — never through the UI.

### Background workers (BullMQ, in `apps/api`, backed by Redis)
| Queue | What it does |
|---|---|
| `transactional-emails` | Sends transactional email via Resend. 3 attempts, exponential backoff (1s→4s→16s), with a dead-letter queue. |
| `job-alerts` | Scans for jobs matching saved alerts and emails matches (instant/daily/weekly). |
| `job-lifecycle` | Daily cron (02:00 Asia/Kolkata) that expires stale jobs. |

When email/R2/Sentry/PostHog secrets are blank (the local default), those features **no-op gracefully** — emails log to the console instead of sending.

### Payments (recruiter billing — Razorpay)
- **Model:** prepaid fixed-duration recruiter plans via the **Orders API + hosted Checkout** (no auto-renew/e-mandates at MVP; Stripe is invite-only for Indian businesses in 2026, so Razorpay is the primary gateway — inverting CLAUDE.md §1's original "Stripe primary" note).
- **Flow:** `POST /recruiter/billing/orders` creates the Razorpay order at the **plan's DB price** → browser opens Checkout → `POST /recruiter/billing/orders/:id/verify` checks the checkout HMAC → **the webhook is the source of truth**: `POST /webhooks/razorpay` (unauthenticated by design; HMAC of the **raw body** against `RAZORPAY_WEBHOOK_SECRET` is the control — `main.ts` boots Nest with `rawBody: true`). Both paths funnel into one idempotent, `FOR UPDATE`-locked activation that marks the order PAID, upserts the company subscription, and issues the GST invoice (pdfkit PDF → private storage → streamed, authenticated download).
- **Idempotency:** `PaymentWebhookEvent.eventId` is unique — replays/duplicates are no-ops; an event that failed mid-processing (no `processedAt`) is reprocessed on Razorpay's retry.
- **Keyless local dev:** blank `RAZORPAY_*` env = stub mode (fake `order_stub_*` ids + a dev-only simulate endpoint that 404s whenever real keys or production are detected).

---

## 11. How a request flows (worked example: applying to a job)

1. A signed-in candidate clicks **Apply** on a job detail page in `apps/web`.
2. The browser sends `POST /me/applications` to `apps/api` with the access-token cookie.
3. The API: verifies the JWT (`@jobportal/auth`) → validates the body (Zod from `@jobportal/types`) → checks the daily application quota (Redis) → enforces any relevant feature flag (`@jobportal/feature-flags`, Layer 3) → writes the `Application` row (Prisma) → enqueues an `application_submitted` email (BullMQ).
4. The worker picks up the email job and sends it through Resend (or logs it in local dev).
5. The API returns a typed response; the web app updates the UI.

Notice every cross-cutting concern (auth, validation, quota, flags) is handled **in the API**, not the frontend.

---

## 12. Where does my code go? (quick guide)

| You're building… | Put it in… |
|---|---|
| A job-seeker page or component | `apps/web` |
| A recruiter-portal page | `apps/recruiter` |
| A new API endpoint / business logic | `apps/api` |
| A reusable button/input/dialog | `packages/ui` |
| A DB schema change + query | `packages/db` (migration + schema) |
| A search index/query change | `packages/search` |
| A shared type or Zod schema | `packages/types` |
| A new paid/premium feature | Behind a flag (`packages/feature-flags`) + 3-layer enforcement |

When in doubt, read the relevant **[CLAUDE.md](./CLAUDE.md)** section and the matching SRS section before coding. The SRS (`docs/SRS.pdf`, local-only) is the source of truth for *what* to build; CLAUDE.md is the source of truth for *how*.

---

*Keep this document accurate. If you change the architecture, update this file in the same PR.*
