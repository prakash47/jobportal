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
- Auth pages, dashboard pages, admin: `noindex`
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

## 11. Workflow Expectations for Claude Code

When the user asks for a feature:

1. **Read this file** (auto-loaded — already done)
2. **Read the relevant SRS section** in `docs/SRS.pdf`
3. **Plan**: list files to create/modify, migrations needed, flags to add. Surface this plan before coding.
4. **Confirm with user** if the plan deviates from SRS, introduces new dependencies, or makes a decision worth recording as an ADR.
5. **Implement** in small commits on a feature branch.
6. **Update** related docs (ADR, URL taxonomy, schema notes) as a part of the same PR.
7. **Run** lint + typecheck + tests before declaring done.
8. **Reference the SRS section in commit messages**.

When the user asks for "the next thing":
- Follow the roadmap order in SRS §12.1 (Phase 1 first)
- Suggest the next logical feature
- Wait for user confirmation before starting

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

## 12. Memory Anchors (Do Not Forget)

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
