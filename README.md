# JobPortal

> India-focused job-search and recruitment platform. Modeled functionally on Naukri.com; designed with the visual restraint of Linear, Stripe, and Vercel.

> **🚀 Start here:** [`TEAM_QUICKSTART.md`](./TEAM_QUICKSTART.md) — one page: setup, the daily workflow, and the exact Claude Code prompts to follow our team process.
>
> **🤖 Every Claude Code session:** paste [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) as your first message — it bootstraps the session (reads the docs, pulls develop, locks in the pull→claim→build→merge→push workflow) since Claude has no memory between sessions.
>
> **👋 New to the team? Read these docs in order:**
> 1. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — what the system is and how the pieces fit together.
> 2. [`ONBOARDING.md`](./ONBOARDING.md) — set up your machine from clone to a fully running local stack.
> 3. [`DEVELOPMENT.md`](./DEVELOPMENT.md) — the branching + merge workflow you must follow.
> 4. [`COLLABORATION.md`](./COLLABORATION.md) — **multi-developer playbook**: how 3 devs build in parallel without duplicate work or conflicts (schema locks, naming, migrations).
>
> **Building day-to-day?** Check [`WORKLOG.md`](./WORKLOG.md) — the live "who is building what right now" board. Read it (and `git pull`) before starting any new work, and claim your work there.
>
> **Setting up on a new machine?** [`ONBOARDING.md`](./ONBOARDING.md) is the full setup guide; [`MIGRATION.md`](./MIGRATION.md) has the Claude Code handoff prompt. [`CLAUDE.md`](./CLAUDE.md) is the project's locked stack + engineering rules (§15 = the coordination protocol); [`PROGRESS.md`](./PROGRESS.md) is the running record of every PR shipped.

[![CI](https://github.com/prakash47/jobportal/actions/workflows/ci.yml/badge.svg)](https://github.com/prakash47/jobportal/actions)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](#license)

---

## Overview

JobPortal is a freemium job board for the Indian market.

- **For job seekers** — SEO-indexed job search, structured profiles, resume uploads, applications, saved jobs, alerts, application tracking.
- **For recruiters** — a dedicated portal for posting jobs and reviewing applicants.

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
| Payments | Stripe / Razorpay |
| Hosting | Vercel + Render |
| Observability | Sentry + PostHog |
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
│   ├── db/           # Prisma schema + queries
│   ├── search/       # Elasticsearch client + indexers
│   ├── auth/         # JWT + Argon2id helpers
│   ├── feature-flags/# Backend-controlled flag system
│   └── types/        # Shared TS types + Zod schemas
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env.example
```

Path aliases: `@jobportal/ui`, `@jobportal/db`, `@jobportal/search`, `@jobportal/auth`, `@jobportal/feature-flags`, `@jobportal/types`.

---

## Quick start

### Prerequisites

- Node.js 24 LTS
- pnpm 10
- Docker Desktop (for Postgres / Redis / Elasticsearch — `infra/docker-compose.yml`, added later)

### Setup

```bash
git clone https://github.com/prakash47/jobportal.git
cd jobportal
pnpm install
cp .env.example .env
```

Generate development secrets:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" >> .env
```

### Run

```bash
pnpm dev
```

| App | URL |
|---|---|
| Job-seeker site | http://localhost:3000 |
| Recruiter portal | http://localhost:3001 |
| Services site | http://localhost:3002 |
| API | http://localhost:4000 |

---

## Branching strategy

Simplified Git Flow.

| Branch | Purpose | Branched from | Merges into |
|---|---|---|---|
| `main` | Production. Always deployable. | — | — |
| `develop` | Integration. Staging deploys from here. | `main` | `main` (release) |
| `feature/<name>` | One feature. | `develop` | `develop` |
| `bugfix/<name>` | Non-urgent fix. | `develop` | `develop` |
| `hotfix/<name>` | Production emergency. | `main` | `main` + `develop` |
| `chore/<name>` | Tooling, deps, docs-only. | `develop` | `develop` |

Default PR target: `develop`. CI must pass before merge.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## Common scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build all apps |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm test` | Vitest units |
| `pnpm clean` | Clear Turbo + dist + .next caches |

---

## Status

**Pre-launch.** Currently scaffolding Phase 1.

---

## License

Proprietary. Copyright © 2026 Prakash Mishra. All rights reserved.

This source code is the property of the project owner. Unauthorized copying, modification, distribution, or use is strictly prohibited.
