# JobPortal — Onboarding & Local Setup Guide

> **Audience:** A new developer setting up the project on their own machine for the first time.
> **Outcome:** A fully running local stack (3 web apps + API + Postgres + Redis + Elasticsearch) with demo data loaded, ready to develop with Claude Code.
> **Time:** ~30–45 minutes on a fresh machine (most of it is downloads).

Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** first if you haven't — it explains *what* you're about to run. After setup, read **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the git workflow.

> Follow the steps **in order**. Several gotchas in this project come from skipping a step or running things out of sequence — they're all called out below.

---

## Part A — Install the tools (one-time)

Install these on your machine once. Versions matter — the project locks them.

| Tool | Version | Install |
|---|---|---|
| **Node.js** | **24.x** LTS ("Krypton") | [nodejs.org](https://nodejs.org) or `nvm install 24 && nvm use 24` |
| **pnpm** | **10.x** | `npm install -g pnpm@10` |
| **Docker Desktop** | latest | [docker.com](https://www.docker.com/products/docker-desktop) — required for Postgres / Redis / Elasticsearch |
| **Git** | any modern | [git-scm.com](https://git-scm.com) |
| **Claude Code** | latest | Your IDE's extension, or the standalone CLI — this is how we develop |
| **GitHub CLI** *(recommended)* | latest | `winget install GitHub.cli` (Windows) · `brew install gh` (macOS) |

Verify everything is on your PATH:

```bash
node -v     # must print v24.x
pnpm -v     # must print 10.x
docker -v   # any recent version
git --version
```

> **Docker Desktop must be running** before you start the database step. On Windows/macOS the whale icon in the tray/menu-bar must be solid (not animating). If Docker isn't running, the database containers — and therefore every dev server — will fail.

> **Windows + native modules:** this project uses `argon2` (a native module for password hashing). If `pnpm install` later fails with a node-gyp / C++ error, install the **"Desktop development with C++"** workload from the Visual Studio Build Tools, then re-run `pnpm install`.

---

## Part B — Get repository access

1. Ask the project owner to add you as a **collaborator** on the `prakash47/jobportal` GitHub repository (you'll get an email invite — accept it).
2. Authenticate git so you can clone and push. Easiest is the GitHub CLI:
   ```bash
   gh auth login
   ```
   Follow the browser prompt. This stores a credential so `git push` works without re-entering a token.

---

## Part C — Clone & configure

Run these from wherever you keep code (e.g. `C:\Projects\` on Windows, `~/code/` on macOS).

```bash
# 1. Clone
git clone https://github.com/prakash47/jobportal.git
cd jobportal

# 2. Switch to the integration branch (main is just the scaffold)
git checkout develop
git pull
```

### C.1 — Set up `.env` files (read this carefully)

There is a committed `.env.example` at the repo root. **You need a `.env` at the root AND a copy inside each of the four runtime apps** — Next.js and NestJS auto-load `.env` from their *own* directory, not the monorepo root. (This was discovered the hard way; skipping it causes `SASL: client password must be a string` errors.)

```bash
# Root .env
cp .env.example .env

# Per-app copies — REQUIRED
cp .env apps/web/.env
cp .env apps/recruiter/.env
cp .env apps/sadmin/.env
cp .env apps/api/.env
```

> **macOS/Linux** use `cp` as shown. **Windows PowerShell** use `Copy-Item`:
> ```powershell
> Copy-Item .env.example .env
> Copy-Item .env apps/web/.env
> Copy-Item .env apps/recruiter/.env
> Copy-Item .env apps/sadmin/.env
> Copy-Item .env apps/api/.env
> ```

**The defaults work as-is for local development.** The `.env.example` ships with working localhost values for Postgres, Redis, Elasticsearch, and dev JWT secrets. Third-party keys (Resend, Stripe, Sentry, R2) are intentionally blank — those features simply no-op locally (e.g. emails print to the console instead of sending).

*Optional:* to regenerate the JWT secrets, run `openssl rand -base64 48` and paste the output into `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`, then re-copy the file to each app.

### C.2 — Install dependencies

```bash
pnpm install
```

First install pulls ~1200 packages and takes a few minutes. Later installs are fast (pnpm content-addressable store).

---

## Part D — Start the infrastructure (Docker)

With Docker Desktop running:

```bash
docker compose -f infra/docker-compose.yml up -d
```

This creates and starts three containers:

| Container | Image | Port |
|---|---|---|
| `jp-postgres` | `postgres:18-alpine` | 5432 |
| `jp-redis` | `redis:8-alpine` | 6379 |
| `jp-elasticsearch` | `docker.elastic.co/elasticsearch/elasticsearch:9.4.0` | 9200 |

Elasticsearch is the slowest to become ready (~30s). Verify all three are up:

```bash
docker ps --format "{{.Names}}: {{.Status}}"
# Expect: jp-postgres, jp-redis, jp-elasticsearch all "Up ..."

curl http://localhost:9200/_cluster/health
# Expect: "status":"green" (or "yellow")
```

---

## Part E — Database & search bootstrap (order matters)

Run these from the repo root, **in this exact order**. The seeding has a hard dependency that the single "full" command does *not* cover on its own (see the note).

```bash
# 1. Generate the Prisma client
pnpm db:generate

# 2. Create the database schema (runs all migrations)
pnpm db:migrate:dev

# 3. Seed REFERENCE data first — feature flags, industries, cities, skills, plans, articles
#    (this also creates the Super Admin login — see the note below step 4)
pnpm db:seed

# 4. Seed the DEMO overlay + applications, then index into Elasticsearch
pnpm --filter @jobportal/db db:seed:demo:full
```

> ### 🔑 Super Admin login
>
> `pnpm db:seed` (step 3) also creates the internal **Super Admin** account, so the portal at
> **http://localhost:3003/sadmin** works as soon as you finish setup:
>
> | Email | Password |
> |---|---|
> | `admin@careerqueue.in` | `Admin@123` |
>
> The password is **re-applied on every seed run**, so re-seeding resets a locally-changed one — that
> is deliberate, so all three machines converge on the same documented credential. Override it with
> `SADMIN_SEED_PASSWORD` in `.env` if you want your own.
>
> This account is `role = ADMIN`, so it also unlocks the older `/admin` console inside the seeker app
> (feature flags, KYC review, support) — which previously nobody could reach, because no admin user
> was seeded anywhere. There is no sign-up page for it by design: `ADMIN` is granted only by this
> seed or a direct DB write (CLAUDE.md §9).
>
> **Not seeded on remote databases.** While the password is still the repo default, this step is
> skipped unless `DATABASE_URL` looks local — the same guard the demo seed uses — so a committed
> credential can never land on staging or production.

> ### ⚠️ Why two seed commands?
> `pnpm --filter @jobportal/db db:seed:demo:full` chains **demo companies/jobs → demo candidates/applications → Elasticsearch reindex**. It does **not** include the reference data (industries, cities, skills, flags). The demo seed will refuse to run with *"Reference data not seeded. Run `pnpm db:seed` first"* if you skip step 3. **Always run `pnpm db:seed` before `pnpm --filter @jobportal/db db:seed:demo:full`.**

### Sanity check

```bash
# Postgres should report 50 active jobs
docker exec jp-postgres psql -U jobportal -d jobportal_dev -t -c "SELECT COUNT(*) FROM \"Job\" WHERE status='ACTIVE';"

# Elasticsearch should have jobs / companies / articles indices populated (50 / 12 / 3)
curl "http://localhost:9200/_cat/indices?v"
```

After this you'll have: 30 feature flags (all OFF), 10 industries, 50 cities, 160 skills, 4 plans, 3 articles, plus the demo overlay — 12 companies, 8 recruiters, 50 jobs, 20 candidates, ~371 applications.

> The demo seed is **idempotent** and **guarded**: it refuses to run when `NODE_ENV=production` or when `DATABASE_URL` doesn't look local (localhost / 127.0.0.1 / `.local` / `.internal`). You can safely re-run `pnpm --filter @jobportal/db db:seed:demo:full` any time you want to reset demo state.

---

## Part F — Run the dev servers

You need **three terminals** (or a multiplexer). One command each, all from the repo root:

```bash
# Terminal 1 — API (NestJS backend)
pnpm --filter @jobportal/api dev
# → http://localhost:4000

# Terminal 2 — Web (job-seeker site)
pnpm --filter @jobportal/web dev
# → http://localhost:3000

# Terminal 3 — Recruiter portal
pnpm --filter @jobportal/recruiter dev
# → http://localhost:3001
```

*(The fourth app, `apps/services` on port 3002, is a placeholder — you usually don't need it running.)*

Each app prints **"Ready in Xs"** when it's up. First compile takes 10–20s.

### Verify the stack

Open **http://localhost:3000**. You should see the homepage with a hero search, "Explore by industry", "Discover jobs by role", "Jobs by city", popular skills, "Companies hiring now", a "Why JobPortal" section, articles, and an FAQ. Click into `/jobs`, a job detail, `/companies`, and `/career-advice` — all should serve real seeded content.

---

## Part G — Demo login credentials

All demo accounts share one password: **`demo-recruiter-pass-2026!`**

**Recruiters** (use at the recruiter portal, http://localhost:3001):

| Email | Company |
|---|---|
| `priya.sharma+demo@jobportal.dev` | Nimbus Cloud Systems |
| `rohan.mehta+demo@jobportal.dev` | Veridian Analytics |
| `aditi.iyer+demo@jobportal.dev` | Sahaj Pay |
| `karthik.reddy+demo@jobportal.dev` | Lumen Health |
| *(8 total — see `packages/db/prisma/seed/demo.ts`)* | |

**Candidates** (use at the job-seeker site, http://localhost:3000): e.g. `arjun.iyer+demo@jobportal.dev`, `kavya.shenoy+demo@jobportal.dev` — 20 total, listed in `packages/db/prisma/seed/demo-applications.ts`.

---

## Part H — Develop with Claude Code

Open the `jobportal/` folder in your IDE with Claude Code. It auto-loads **`CLAUDE.md`** (the binding engineering rules). To give Claude full context at the start of a session, paste:

```
I'm working on the JobPortal project. Before doing anything:
1. Read CLAUDE.md (auto-loaded) — the engineering rules.
2. Read PROGRESS.md — what has shipped to develop so far.
3. Read ARCHITECTURE.md — the system design.
Then wait for my task. Follow the branching workflow in DEVELOPMENT.md.
```

When you're ready to build something, follow **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

---

## Part I — Stopping & restarting

```bash
# Stop dev servers: Ctrl+C in each terminal.

# Stop Docker containers (keeps your data):
docker compose -f infra/docker-compose.yml stop

# Start them again next session:
docker compose -f infra/docker-compose.yml start
# (or `up -d` if they were removed)
```

Your seeded data persists in Docker volumes between `stop`/`start`. Only `docker compose ... down -v` deletes it (then you'd re-run Part E).

---

## Part J — Troubleshooting (real gotchas from this project)

| Symptom | Cause & fix |
|---|---|
| `SASL: client password must be a string` | A `.env` is missing. Confirm `.env` exists at the **root AND** in `apps/web`, `apps/recruiter`, `apps/api` (Part C.1). |
| Demo seed errors: *"Reference data not seeded"* | You ran `pnpm --filter @jobportal/db db:seed:demo:full` before `pnpm db:seed`. Run `pnpm db:seed` first (Part E step 3). |
| Every route returns **404** (even `/login`, `/jobs`) on a Next app | Stale/corrupt Turbopack cache — common after a hard kill. Stop the app, delete its cache, restart: `pnpm --filter @jobportal/web clean` (removes `.next` + `.turbo`), then `pnpm --filter @jobportal/web dev`. The same applies to `@jobportal/recruiter`. |
| `pnpm install` fails on Windows with a C++/node-gyp error | Install the VS Build Tools "Desktop development with C++" workload, then re-run (the `argon2` native module needs it). |
| Containers won't start / `docker` command errors | Docker Desktop isn't running. Start it, wait for the whale icon to settle, then `docker compose -f infra/docker-compose.yml up -d`. |
| Elasticsearch `/jobs` page errors or search returns nothing | The indices aren't built. Run `pnpm search:reindex` (or re-run `pnpm --filter @jobportal/db db:seed:demo:full`). |
| Port already in use (3000/3001/4000) | A previous dev server didn't shut down. Kill the stray Node process holding the port, then restart. |
| Need to fully reset the database | `pnpm db:reset` (drops + re-migrates), then re-run Part E steps 3–4. |

---

## Notes

- **`docs/SRS.pdf` is not in the repo** (the `docs/` folder is gitignored). The SRS is the source of truth for *what* to build. Ask the owner for a copy and drop it at `<repo>/docs/SRS.pdf` so Claude Code can reference it.
- **Never commit `.env` files or secrets.** Only `.env.example` is tracked.
- If anything here is out of date, fix it in a `docs:` commit so the next person doesn't hit the same wall.

Welcome to the team. 🚀
