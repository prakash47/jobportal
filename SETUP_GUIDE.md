# JobPortal — Setup & Workflow Guide

This guide gets you from zero to a working dev environment, then onto a sustainable Claude Code workflow. Follow the steps in order.

---

## Step 1 — Local prerequisites

Install on your machine:

- **Node.js 24.x LTS** ("Krypton") — `nvm install 24 && nvm use 24`
- **pnpm 10.x** — `npm install -g pnpm@10`
- **Docker Desktop** (for local Postgres 18, Redis 8, Elasticsearch 9)
- **Git** + a GitHub account with SSH keys configured
- **VS Code** or **Cursor** with the **Claude Code** extension installed

Verify:
```bash
node -v   # v24.x
pnpm -v   # 10.x
docker -v
```

---

## Step 2 — Project folder & initial files

Create the project folder and initialize git:

```bash
mkdir jobportal && cd jobportal
git init
```

Drop these files at the root:

1. **`CLAUDE.md`** — paste the master prompt I gave you (the other file). This is the most important file in the repo. Claude Code auto-loads it every session.
2. **`docs/SRS.pdf`** — your existing SRS (move it here)
3. **`.gitignore`** — Node defaults (`npx gitignore node` or generate from gitignore.io). Add: `.env`, `.env.local`, `.next/`, `dist/`, `node_modules/`, `*.log`, `.turbo/`, `.DS_Store`, `coverage/`
4. **`README.md`** — short description (you can have Claude Code generate this in step 5)
5. **`pnpm-workspace.yaml`**:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
6. **`.env.example`** — template (see Step 7)

First commit:
```bash
git add .
git commit -m "chore: initialize repo with SRS and CLAUDE.md"
```

---

## Step 3 — GitHub setup

1. Create a **private** GitHub repo named `jobportal` (do not initialize with README — your local already has one).
2. Add the remote and push:
   ```bash
   git remote add origin git@github.com:<your-username>/jobportal.git
   git branch -M main
   git push -u origin main
   ```
3. Create the `develop` branch (this is your integration branch):
   ```bash
   git checkout -b develop
   git push -u origin develop
   ```
4. **Set branch protections** in GitHub → Settings → Branches:
   - **`main`**: require PR review, require status checks (CI green), no direct pushes, require linear history
   - **`develop`**: require PR review, require CI green, no direct pushes
5. **Default branch** → set to `develop` so PRs target it by default.

---

## Step 4 — Branching strategy

Simplified Git Flow. One branch per feature; feature branches are short-lived.

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

---

## Step 5 — First Claude Code session

Open the `jobportal/` folder in your editor with Claude Code. Claude Code will detect `CLAUDE.md` and load it automatically.

For the **first task**, give Claude Code this prompt:

> Read `CLAUDE.md` fully, then read `docs/SRS.pdf` sections 9 (System Architecture) and 10 (Project Structure). Scaffold the monorepo: create `apps/{web,recruiter,services,api}` and `packages/{ui,db,search,auth,feature-flags,types}` with minimal `package.json` and `tsconfig.json` per workspace. Add `turbo.json`, root `tsconfig.base.json` with `@jobportal/*` path aliases, and a basic `README.md`. Use Next.js 16, NestJS 11, Tailwind 4 (CSS-first, no `tailwind.config.ts`), TypeScript 5.9 strict. Don't install heavy dependencies yet — keep it minimal. Do everything on a feature branch named `feature/monorepo-scaffold` and open a PR to `develop`.

After that lands, work feature-by-feature. Sample prompts:

- "Implement the Prisma 7 schema per SRS §8.2 in `packages/db`. Branch from develop as `feature/db-schema-and-prisma`. Use `prisma.config.ts` for environment configuration (with `dotenv/config` import). Include the seed file with all feature flags from SRS §7.8 set to `enabled: false`."
- "Implement the auth system per SRS §4.12 in `packages/auth` and `apps/api/src/auth`. JWT + Argon2id + refresh rotation."
- "Implement the feature flag service per SRS §7. Data model first, then the evaluator with all 5 flag types, then the React `cache()` wrapper, then the admin API endpoints."
- "Build the job detail page per SRS §4.2 in `apps/web/app/job/[slug]/page.tsx`. Include the JobPosting JSON-LD and the canonical-redirect logic from §6.3."
- "Wire Elasticsearch 9 indexing for jobs per SRS §4.14 — but use Elasticsearch instead of Meilisearch as noted in CLAUDE.md."

If Claude Code ever drifts (suggests a different stack, generic UI, skips feature flags, etc.), reset with: **"Re-read CLAUDE.md sections 1, 2, and 4. Stay on the locked stack and design rules."**

---

## Step 6 — Local infrastructure (Docker)

Create `infra/docker-compose.yml`:

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:18-alpine
    container_name: jp-postgres
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: jobportal
      POSTGRES_PASSWORD: jobportal
      POSTGRES_DB: jobportal_dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:8-alpine
    container_name: jp-redis
    ports: ["6379:6379"]

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:9.4.0
    container_name: jp-elasticsearch
    ports: ["9200:9200"]
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    volumes:
      - esdata:/usr/share/elasticsearch/data

volumes:
  pgdata:
  esdata:
```

Start everything:
```bash
docker compose -f infra/docker-compose.yml up -d
```

Verify:
```bash
docker ps                       # 3 containers running
curl http://localhost:9200      # Elasticsearch responds
```

---

## Step 7 — Environment variables

Create `.env.example` at the root (commit this — it's a template):

```bash
# Database
DATABASE_URL="postgresql://jobportal:jobportal@localhost:5432/jobportal_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# Elasticsearch
ELASTICSEARCH_URL="http://localhost:9200"

# Auth — generate with: openssl rand -base64 48
JWT_ACCESS_SECRET="dev-access-secret-replace-me"
JWT_REFRESH_SECRET="dev-refresh-secret-replace-me"

# Email (Resend) — leave blank locally; emails log to console
RESEND_API_KEY=""

# Cloudflare R2 — leave blank locally; uploads can use a local dev folder
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET="jobportal-dev"

# Stripe — Phase 2 only, leave blank for now
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""

# Sentry / PostHog — optional locally
SENTRY_DSN=""
POSTHOG_KEY=""

# App URLs (for cross-app links + CORS)
WEB_URL="http://localhost:3000"
RECRUITER_URL="http://localhost:3001"
SERVICES_URL="http://localhost:3002"
SADMIN_URL="http://localhost:3003"
API_URL="http://localhost:4000"
```

Each developer copies this to `.env` (gitignored) at the root **and then copies that same file into each runtime app** — `apps/api`, `apps/web`, `apps/recruiter`, `apps/sadmin`. This is required, not optional: Next.js and NestJS load `.env` from their own directory and never see the monorepo root. (`apps/services` reads no env and needs none.) Copy the file rather than generating secrets per app — a `JWT_ACCESS_SECRET` that differs between `apps/api` and `apps/sadmin` makes Super Admin sign-in succeed and then bounce back to the login page. Full instructions: [ONBOARDING.md](./ONBOARDING.md) Part C.1.

An app may additionally carry its own `.env.local` for app-specific overrides.

**Never commit `.env` or `.env.local`** — only `.env.example`.

---

## Step 8 — Run locally

After Claude Code has scaffolded the apps and packages:

```bash
pnpm install
pnpm db:migrate          # runs Prisma migrations
pnpm db:seed             # seeds feature flags (all OFF), industries, cities, skills
pnpm search:reindex      # populates Elasticsearch from Postgres
pnpm dev                 # starts all apps via Turborepo
```

Apps will be available on:
- **web**: http://localhost:3000
- **recruiter**: http://localhost:3001
- **services**: http://localhost:3002
- **sadmin** (internal Super Admin): http://localhost:3003/sadmin
- **api**: http://localhost:4000
- **Prisma Studio** (DB GUI): `pnpm db:studio` → http://localhost:5555

---

## Step 9 — Staging environment

**Recommended setup**:

1. **Vercel** — Connect the GitHub repo. Create three projects (web, recruiter, services) pointing at the respective `apps/*` folders.
   - Production branch: `main`
   - Preview branch: `develop` (deploys to a stable staging URL like `staging-web.jobportal.com`)
   - Every PR also gets its own preview URL automatically.

2. **Render** — Create the API service from the GitHub repo.
   - Production: deploys from `main`
   - Staging: a second Render service deploying from `develop`

3. **Neon** — Create one Postgres 18 project with two branches: `main` (production) and `develop` (staging).

4. **Upstash** — Two Redis 8 instances (production + staging).

5. **Elasticsearch** — Self-host 9.x on Fly.io for staging; same on a separate node for production. Or use Elastic Cloud.

6. **Environment variables** — set per environment in Vercel/Render dashboards. Never share secrets between staging and production.

7. **Smoke tests** — Run a small Playwright suite against staging before merging `develop` → `main`.

---

## Step 10 — CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: jobportal
          POSTGRES_PASSWORD: jobportal
          POSTGRES_DB: jobportal_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://jobportal:jobportal@localhost:5432/jobportal_test
      - run: pnpm build
```

CI must pass before any PR can merge.

---

## Step 11 — How to use the master prompt every session

There are **two layers of context** Claude Code uses:

1. **`CLAUDE.md` (auto-loaded every session)** — pins the tech stack, design rules, architecture, workflow.
2. **Your per-task prompt (you write each time)** — references the specific SRS section.

**Per-task prompt template**:

> Implement **\<feature name\>** per SRS §**\<X.Y\>**. Branch from `develop` as `feature/<short-name>`. Read the SRS section first and surface a plan (files to create, migrations, flags) before coding. Reference SRS §X.Y in commit messages.

**Examples**:

- *"Implement job search & SRP per SRS §4.1. Branch as `feature/job-search-srp`. Surface the file plan first."*
- *"Implement saved jobs per SRS §4.4. Reuse existing patterns from the apply flow."*
- *"Implement job alerts per SRS §4.5, including the BullMQ daily worker. Branch as `feature/job-alerts`."*
- *"Implement the recruiter portal job posting wizard per SRS §4.9. Branch as `feature/recruiter-job-posting`."*
- *"Implement the admin feature-flags page per SRS §4.16 and §7.7. Branch as `feature/admin-feature-flags`."*

**If Claude Code drifts**:
- "Re-read CLAUDE.md sections 1 and 2. We are NOT using \<wrong thing\>. Stay on the locked stack."
- "The UI is too \<adjective\>. Reference CLAUDE.md §2 — Linear/Stripe minimalism. Redo the visual design."
- "This paid feature must be flag-gated per CLAUDE.md §4 and SRS §7. Add the flag and three-layer enforcement."

---

## Step 12 — Roadmap (follow SRS §12.1 in order)

**Phase 1 — Freemium MVP (Months 0–3)** — recommended order of feature branches:

1. `feature/monorepo-scaffold`
2. `feature/db-schema-and-prisma` (SRS §8)
3. `feature/feature-flag-system` (SRS §7) — **build this early; everything paid-related depends on it**
4. `feature/auth-jwt-system` (SRS §4.12)
5. `feature/design-system` (`packages/ui` Tailwind 4 `@theme` + atoms — Linear/Stripe vibes)
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

**Phase 1 success criteria**: 10k MAU, top-3 rank for "{city} jobs" in 5 cities, 60% LCP under 2.5s.

Don't enable any paid feature in Phase 1. The whole subscription system ships built-but-OFF.

---

## Quick troubleshooting

| Symptom | Fix |
|---|---|
| Claude Code "forgot" the stack | Tell it to re-read `CLAUDE.md` sections 1 & 2. |
| Claude Code creates `tailwind.config.ts` | Tailwind 4 is CSS-first. Tell it to delete and use `@theme` in CSS. |
| UI starts looking generic / Naukri-ish | Reference `CLAUDE.md` §2. Point at Linear/Stripe explicitly. |
| Feature creeping outside SRS | Open SRS, find the section, paste the relevant FR-X.Y back into the prompt. |
| Migration drift in staging | Never `prisma db push` outside local. Always `prisma migrate deploy`. |
| Forgot to flag-gate a paid feature | Refactor in the same PR before merge. Don't ship a paid feature without all 3 enforcement layers. |
| Prisma `.env` not loading | Prisma 7 `prisma.config.ts` doesn't auto-load `.env`. Add `import 'dotenv/config'` at the top. |
| Tests slow / flaky | Move slow tests to nightly schedule; keep PR CI under 5 minutes. |

---

## Final notes

- Keep `CLAUDE.md` updated as the project evolves. It's the project's memory.
- Write a short ADR (`docs/adr/NNNN-title.md`) every time you make a non-obvious architectural call. Future-you will thank you.
- Commit small. PR small. Merge often.
- Don't enable monetization until Phase 2. Ship a great free product first.

Good luck. Start with Step 1 and work through in order.
