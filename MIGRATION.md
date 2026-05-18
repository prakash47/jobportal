# JobPortal — New-PC Migration Guide

How to clone this repo onto a fresh machine and get the full local stack running, then resume work in Claude Code with all context restored.

This is different from `SETUP_GUIDE.md` — that one is the original "build from scratch" walkthrough (kept for reference). This guide assumes the repo already exists and is just being checked out on a new machine.

---

## Part A — One-time prerequisites on the new PC

Install these once:

| Tool | Version | How |
|---|---|---|
| **Node.js** | 24.x LTS ("Krypton") | `nvm install 24 && nvm use 24` (or download from nodejs.org) |
| **pnpm** | 10.x | `npm install -g pnpm@10` |
| **Docker Desktop** | latest | docker.com/products/docker-desktop — required for Postgres / Redis / Elasticsearch containers |
| **Git** | any modern | git-scm.com |
| **GitHub CLI** (optional but useful) | latest | `winget install GitHub.cli` on Windows, `brew install gh` on macOS |
| **Claude Code** | latest | Install in VS Code / Cursor (or the standalone CLI) |

Sanity-check after install:

```bash
node -v    # v24.x
pnpm -v    # 10.x
docker -v  # any recent
git --version
```

Make sure Docker Desktop is **running** (the whale icon in the tray must be green/quiet). Postgres, Redis, and Elasticsearch all run as Docker containers — without Docker Desktop running, none of the dev servers will work.

---

## Part B — Clone + first-time setup

Run these from the directory where you want the project to live (e.g. `C:\Project\` on Windows, `~/code/` on macOS).

```bash
# 1. Clone the repo from GitHub
git clone https://github.com/prakash47/jobportal.git
cd jobportal

# 2. Switch to develop (the integration branch — main is just the scaffold)
git checkout develop
git pull
```

### B.1 — Set up `.env` files

The repo has `.env.example` at the root (committed). Each app (`apps/web`, `apps/recruiter`, `apps/api`) **also needs its own copy of `.env`** at its package root — this was discovered the hard way in PR #33, because Next.js / NestJS auto-load `.env` from their own cwd, not from the monorepo root.

```bash
# Root .env
cp .env.example .env

# Per-app copies (the same file, copied to each)
cp .env apps/web/.env
cp .env apps/recruiter/.env
cp .env apps/api/.env
```

**You can use the defaults as-is for local dev.** The `.env.example` ships with sensible localhost values for Postgres / Redis / Elasticsearch / JWT secrets. Real secrets (Resend, Stripe, Sentry, R2) are blank by default — that's fine; the corresponding features no-op when their env vars are blank.

(If you want to regenerate the JWT secrets: `openssl rand -base64 48` and paste into both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`, then re-copy to each app.)

### B.2 — Install dependencies

```bash
pnpm install
```

This pulls down ~1200 packages across the monorepo. First install is slow (~3-5 min); subsequent runs use the pnpm content-addressable store and finish in seconds.

### B.3 — Start the infrastructure containers

```bash
docker compose -f infra/docker-compose.yml up -d
```

Creates and starts three containers:

- `jp-postgres` (Postgres 18) on port `5432`
- `jp-redis` (Redis 8) on port `6379`
- `jp-elasticsearch` (Elasticsearch 9.4) on port `9200`

Wait ~30 seconds for Elasticsearch to come up (it's the slowest), then verify:

```bash
docker ps --format "{{.Names}}: {{.Status}}"
# Expected: all three "Up X seconds"

curl http://localhost:9200/_cluster/health
# Expected: "status":"green" or "yellow"
```

### B.4 — Generate Prisma client + run migrations

```bash
pnpm --filter @jobportal/db db:generate
pnpm --filter @jobportal/db db:migrate:dev
```

`db:generate` writes the Prisma client to `packages/db/generated/`. `db:migrate:dev` creates the schema in the empty Postgres database.

### B.5 — Seed reference data + demo overlay + index into Elasticsearch

One command does all three:

```bash
pnpm --filter @jobportal/db db:seed:demo:full
```

That chains: reference seed (industries / cities / skills / articles / flags) → demo overlay (companies / recruiters / reviews / jobs / candidates / applications) → Elasticsearch reindex. Takes ~30 seconds end-to-end.

Sanity check:

```bash
docker exec jp-postgres psql -U jobportal -d jobportal_dev -t -c "SELECT COUNT(*) FROM \"Job\" WHERE status='ACTIVE';"
# Expected: 50

curl -s "http://localhost:9200/_cat/indices?v"
# Expected: jobs-v?, companies-v?, articles-v? each with docs.count = 50 / 12 / 3
```

---

## Part C — Start the dev servers

You need **three terminals** (or one with a multiplexer). Run one of these in each:

```bash
# Terminal 1 — Web (job-seeker site)
pnpm --filter @jobportal/web dev
# → http://localhost:3000

# Terminal 2 — Recruiter portal
pnpm --filter @jobportal/recruiter dev
# → http://localhost:3001

# Terminal 3 — API (NestJS backend)
pnpm --filter @jobportal/api dev
# → http://localhost:4000
```

Each takes ~10-20 seconds to compile on first start. Wait for the "Ready in Xs" line in each terminal before testing.

### Verify the stack

Open `http://localhost:3000` in your browser. You should see:

- **Trust strip**: "50 Active jobs · 12 Companies hiring · 8 Hiring teams"
- **Jobs by city** section with 12 city tiles (Bangalore, Mumbai, etc.)
- **In-demand right now** section with 12 skill tiles (Python, React, etc.)
- **Companies hiring now** section with 8 company tiles showing initial-monogram avatars (NC, SP, VA, etc.)
- **From the JobPortal team** section with 3 article cards

Click around — `/jobs`, `/jobs-in-bangalore`, `/python-jobs`, `/python-jobs-in-bangalore`, `/companies`, `/company/nimbus-cloud-systems-overview-1`, `/career-advice` should all serve real content.

---

## Part D — Demo credentials

All demo users share the same password: **`demo-recruiter-pass-2026!`** (override via `DEMO_SEED_PASSWORD` env var before re-running the seed if you want a different password).

### Recruiters (8 — for the recruiter portal at `:3001`)

| Email | Company |
|---|---|
| `priya.sharma+demo@jobportal.dev` | Nimbus Cloud Systems |
| `rohan.mehta+demo@jobportal.dev` | Veridian Analytics |
| `aditi.iyer+demo@jobportal.dev` | Sahaj Pay |
| `karthik.reddy+demo@jobportal.dev` | Lumen Health |
| `aarti.singh+demo@jobportal.dev` | Pathshala Learning |
| `vivek.patel+demo@jobportal.dev` | Kirana Stack |
| `neha.kapoor+demo@jobportal.dev` | Rasta Logistics |
| `sanjay.verma+demo@jobportal.dev` | Sutra Labs |

### Candidates (20 — for the seeker site at `:3000`)

Sample: `arjun.iyer+demo@jobportal.dev` (Staff Engineer), `kavya.shenoy+demo@jobportal.dev` (Senior Backend), `ananya.rao+demo@jobportal.dev` (Frontend), `manish.verma+demo@jobportal.dev` (Fresh grad). Full list in `packages/db/prisma/seed/demo-applications.ts`.

---

## Part E — Notes & gotchas

### `docs/SRS.pdf` is NOT in the repo

Per PR #30 the `docs/` folder is gitignored (it holds the SRS and other strategy material that we keep off GitHub). **You need to manually copy `docs/SRS.pdf` from your old PC to the new PC** — drop it into `<repo>/docs/SRS.pdf` and Claude Code will be able to read it again.

If you don't have it handy, the project still works without it — Claude Code just won't be able to reference SRS sections by page number. CLAUDE.md and PROGRESS.md together cover the architectural decisions.

### If `pnpm install` fails on Windows with native-module errors

`argon2` is a native module used by `@jobportal/auth` (password hashing). On Windows you may need the Visual Studio Build Tools installed first:

```bash
npm install --global windows-build-tools  # or install "Desktop development with C++" via VS Installer
```

### If `db:seed:demo:full` fails with `SASL: client password must be a string`

Means `.env` isn't being picked up. Make sure `.env` exists at the repo root AND inside each app folder (`apps/web/.env`, `apps/recruiter/.env`, `apps/api/.env`).

### Re-seeding the demo

Safe to run any time — the seed is idempotent. Run when you want to reset the demo state:

```bash
pnpm --filter @jobportal/db db:seed:demo:full
```

### Stopping the stack

```bash
# Stop dev servers — Ctrl+C in each terminal

# Stop Docker containers (keeps data)
docker compose -f infra/docker-compose.yml stop

# Or fully tear down (DELETES the seeded data — only do this if you want a fresh DB)
docker compose -f infra/docker-compose.yml down -v
```

---

## Part F — Claude Code handoff prompt (paste into the new session)

Open the cloned `jobportal/` folder in Claude Code on the new PC. Claude Code auto-loads `CLAUDE.md`. To get full context, paste this prompt as your first message:

```
Continuing the JobPortal project on a new machine. The repo and its full
context already exist — your job before doing any work is to load that
context.

Required reads (in order):
1. CLAUDE.md  — already auto-loaded; project rules and locked stack
2. PROGRESS.md — every PR shipped to develop so far, all closed/open
   chips, demo credentials. This is the ground-truth status file.
3. MIGRATION.md — the new-PC setup steps (so you know how the local
   stack was bootstrapped on this machine)

Quick orientation (don't trust this, verify against PROGRESS.md):
- Phase 1 is complete (18/18). Last merged PR is in the #36–#40 range.
- Local stack on this machine: web at :3000, recruiter at :3001,
  API at :4000, Docker containers jp-postgres / jp-redis / jp-elasticsearch.
- Demo data is loaded (12 companies, 8 recruiters, 50 jobs, 20 candidates,
  371 applications). Seed via `pnpm db:seed:demo:full` to reset.
- 32/32 public routes verified green as of the last QA pass on the
  source machine — re-verify on this machine before starting new work.

Once you've read CLAUDE.md and PROGRESS.md, report back with:
- Develop tip commit (last 5 git log entries)
- Phase 1 progress count from PROGRESS.md
- Currently open follow-up chip numbers (don't list closed ones)
- Local stack status (run a quick `docker ps` and `curl localhost:3000`
  to confirm web is up)

Then wait for my actual task — don't start implementing anything yet.
```

---

## Part G — When you finish work on the new PC

Same workflow as before. Push from the new PC:

```bash
git add .
git commit -m "feat(...): ..."
git push -u origin feature/...
gh pr create --base develop ...
gh pr merge ... --merge --delete-branch
```

PROGRESS.md auto-syncs across machines via git. There's no machine-specific state in the repo — everything is in committed files plus the Docker volumes (which are local to each machine but holding the same seeded data on both).

If you ever come back to the old PC, just `git checkout develop && git pull` to catch up.

---

End of MIGRATION.md.
