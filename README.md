# JobPortal

> India-focused job-search and recruitment platform. Modeled functionally on Naukri.com; designed with the visual restraint of Linear, Stripe, and Vercel.

[![CI](https://github.com/<your-username>/jobportal/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-username>/jobportal/actions)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](#license)

---

## Overview

JobPortal is a freemium job board for the Indian market. It provides:

- **For job seekers**: SEO-indexed job search, structured profiles, resume uploads, applications, saved jobs, alerts, application tracking.
- **For recruiters**: a dedicated portal for posting jobs, reviewing applicants, and (Phase 2) searching the candidate database.
- **For the business**: a backend-controlled feature flag system that lets paid features ship dark and activate without a redeploy.

The full functional specification lives in [`docs/SRS.pdf`](./docs/SRS.pdf). The technical and design constraints live in [`CLAUDE.md`](./CLAUDE.md) (read before contributing).

---

## Tech stack (latest stable as of May 2026)

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 (strict) |
| Runtime | Node.js 24 LTS |
| Frontend | Next.js 16 (App Router, RSC, Turbopack) + React 19.2 |
| Styling | Tailwind CSS 4 (CSS-first, OKLCH) |
| Backend | NestJS 11 (BFF) |
| ORM | Prisma 7 (Rust-free Client) |
| Database | PostgreSQL 18 |
| Search | Elasticsearch 9.4 |
| Cache & queues | Redis 8 + BullMQ |
| Auth | Custom JWT (HS256) + Argon2id |
| Storage | Cloudflare R2 |
| Email | Resend |
| Payments (Phase 2) | Stripe / Razorpay |
| Hosting | Vercel (web) + Render (api) + Neon (db) + Upstash (redis) |
| Observability | Sentry + PostHog |
| CDN/WAF | Cloudflare |
| Monorepo | pnpm 10 + Turborepo 2 |

---

## Repository layout

```
jobportal/
├── apps/
│   ├── web/          # Next.js — job-seeker site
│   ├── recruiter/    # Next.js — recruiter portal
│   ├── services/     # Next.js — paid services site
│   └── api/          # NestJS BFF
├── packages/
│   ├── ui/           # Shared design system (Tailwind 4 @theme)
│   ├── db/           # Prisma schema, queries, seed
│   ├── search/       # Elasticsearch client + indexers
│   ├── auth/         # JWT + Argon2id helpers
│   ├── feature-flags/# Backend-controlled flag system ★
│   └── types/        # Shared TS types + Zod schemas
├── infra/
│   └── docker-compose.yml
├── docs/
│   ├── SRS.pdf       # Source of truth for features
│   ├── architecture.md
│   ├── url-taxonomy.md
│   ├── ssr-csr-decisions.md
│   ├── subscription-system.md
│   ├── database-schema.md
│   └── adr/          # Architecture Decision Records
├── .github/workflows/ci.yml
├── CLAUDE.md         # Master context for Claude Code
├── README.md
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

Path aliases: `@jobportal/ui`, `@jobportal/db`, `@jobportal/search`, `@jobportal/auth`, `@jobportal/feature-flags`, `@jobportal/types`.

---

## Quick start

### 1. Prerequisites

- Node.js 24 LTS (`nvm install 24 && nvm use 24`)
- pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop
- Git

### 2. Clone & install

```bash
git clone git@github.com:<your-username>/jobportal.git
cd jobportal
pnpm install
cp .env.example .env
```

Generate development secrets:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" >> .env
```

### 3. Start local infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
```

This starts PostgreSQL 18, Redis 8, and Elasticsearch 9.4 locally.

### 4. Migrate, seed, and run

```bash
pnpm db:migrate          # apply Prisma migrations
pnpm db:seed             # seed feature flags (all OFF), industries, cities, skills
pnpm search:reindex      # populate Elasticsearch from Postgres
pnpm dev                 # start every app via Turborepo
```

| App | URL |
|---|---|
| Job-seeker site | http://localhost:3000 |
| Recruiter portal | http://localhost:3001 |
| Services site | http://localhost:3002 |
| API | http://localhost:4000 |
| Prisma Studio | `pnpm db:studio` → http://localhost:5555 |

---

## Branching strategy

Simplified Git Flow:

| Branch | Purpose |
|---|---|
| `main` | Production. Always deployable. |
| `develop` | Integration. Staging deploys from here. |
| `feature/<name>` | Single feature, branched off `develop`. |
| `bugfix/<name>` | Non-urgent fix, branched off `develop`. |
| `hotfix/<name>` | Production emergency, branched off `main`. |
| `chore/<name>` | Tooling, deps, docs-only. |

Default PR target: `develop`. CI must pass before merge.

Commit messages follow Conventional Commits, and feature commits should reference the SRS section (e.g., `feat(jobs): implement SRP per SRS §4.1`).

---

## Working with Claude Code

`CLAUDE.md` at the repo root is auto-loaded by Claude Code on every session. It pins the tech stack, design rules, architecture, feature-flag contract, and workflow. Read it before contributing.

Per-task prompt template:

> Implement **\<feature\>** per SRS §**\<X.Y\>**. Branch from `develop` as `feature/<name>`. Read the SRS section first and surface a plan before coding. Reference SRS §X.Y in commit messages.

If Claude Code drifts (wrong stack, generic UI, skipping flags), reset with: *"Re-read CLAUDE.md sections 1, 2, and 4."*

---

## Phase 1 roadmap

Phase 1 ships a freemium MVP. The full subscription system is built but every flag is OFF on launch — the user experience is 100% free. Recommended build order:

1. Monorepo scaffold
2. Prisma schema + DB seed
3. **Feature flag system** (everything paid depends on it)
4. Auth (JWT + Argon2id)
5. Design system (`packages/ui` Tailwind 4 `@theme`)
6. Elasticsearch integration
7. Job search SRP + URL taxonomy
8. Job detail page + JSON-LD
9. User profile + resume upload
10. Apply + saved jobs
11. Job alerts (BullMQ daily worker)
12. Application tracking
13. Companies directory
14. Career advice CMS
15. Recruiter portal
16. Admin console
17. Sitemap + SEO
18. Observability (Sentry + PostHog)

**Phase 1 success criteria**: 10k MAU, top-3 Google rank for "{city} jobs" in 5 cities, p75 LCP under 2.5s.

Phase 2 (Months 3–6) activates monetization: services menu, Premium plan, Stripe billing, AI Interview. Phase 3 (Months 6–12) adds recruiter Resdex, Enterprise plan, multi-language.

---

## Common scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build all apps |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm test` | Vitest units across packages |
| `pnpm test:e2e` | Playwright e2e tests |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Seed dev DB |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm search:reindex` | Reindex Elasticsearch from Postgres |
| `pnpm clean` | Clear Turbo + dist + .next caches |

---

## Documentation

- **Functional specification** — [`docs/SRS.pdf`](./docs/SRS.pdf)
- **Master context for Claude Code** — [`CLAUDE.md`](./CLAUDE.md)
- **System architecture** — [`docs/architecture.md`](./docs/architecture.md)
- **URL taxonomy** — [`docs/url-taxonomy.md`](./docs/url-taxonomy.md)
- **SSR/SSG/ISR/CSR decisions** — [`docs/ssr-csr-decisions.md`](./docs/ssr-csr-decisions.md)
- **Subscription & feature flag deep-dive** — [`docs/subscription-system.md`](./docs/subscription-system.md)
- **Database schema rationale** — [`docs/database-schema.md`](./docs/database-schema.md)
- **Architecture Decision Records** — [`docs/adr/`](./docs/adr)

---

## Status

**Pre-launch.** Currently scaffolding Phase 1 (Months 0–3).

---

## License

Proprietary. Copyright © 2026 Vartika. All rights reserved.

This source code is the property of the project owner. Unauthorized copying, modification, distribution, or use is strictly prohibited.
