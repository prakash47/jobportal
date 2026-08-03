# JobPortal — Development Workflow

> **Audience:** Every developer committing code to this project.
> **Goal:** One consistent, safe path from "I have a task" to "it's merged into `develop`."

This is the binding day-to-day workflow. It complements **[CLAUDE.md §11](./CLAUDE.md)** (branching strategy). Where this file and CLAUDE.md agree, follow either; CLAUDE.md is the canonical rule source.

---

## 1. Branch model

We use a simplified Git Flow with two long-lived branches:

| Branch | Purpose | Branch from | Merges into |
|---|---|---|---|
| `main` | Production. Always deployable. | — | — |
| `develop` | Integration. Everything lands here first. | `main` | `main` (at release time) |
| `feature/<name>` | One new feature. | `develop` | `develop` |
| `bugfix/<name>` | A non-urgent fix. | `develop` | `develop` |
| `chore/<name>` | Tooling, deps, or docs-only changes. | `develop` | `develop` |
| `hotfix/<name>` | Production emergency. | `main` | `main` **and** `develop` |

**Hard rules:**
- **Never commit directly to `main` or `develop`.** Always work on a `feature/`, `bugfix/`, `chore/`, or `hotfix/` branch.
- Branch names: **lowercase, hyphen-separated, type-prefixed**. No spaces, camelCase, or underscores.
  - ✅ `feature/job-alerts-bullmq`, `bugfix/canonical-redirect-edge-case`, `chore/update-deps`
  - ❌ `Feature/JobAlerts`, `fix_bug`, `my-branch`
- Keep branches **short-lived** (≤ ~1 week). Long branches drift and create painful merges.

---

## 2. The standard flow (feature / bugfix / chore)

This is the exact sequence to follow for every change. We **do not use pull-request reviews** on this project — you integrate and merge through the command line — so the build/test gate below is what protects `develop`. Take it seriously.

### Step 1 — Start from the latest `develop`

```bash
git checkout develop
git pull
git checkout -b feature/<short-name>
```

### Step 2 — Build it

Write your code in small, focused commits. Reference the SRS section in the commit body when implementing a feature.

```bash
git add .
git commit -m "feat(jobs): scaffold SRP route per SRS §4.1"
# ...more small commits as you go
```

Commit message format (Conventional Commits):
- `feat:` — a new feature
- `fix:` — a bug fix
- `chore:` — tooling / deps / config
- `docs:` — documentation only
- `refactor:`, `test:`, `perf:` — as named

### Step 3 — Verify locally, then push

Before pushing, make sure your own work is clean:

```bash
pnpm typecheck
pnpm test
```

Then push your branch (this also backs your work up to GitHub):

```bash
git push -u origin feature/<short-name>
```

### Step 4 — Integrate the latest `develop` into your branch

Someone else may have merged while you were working. Pull their changes **into your branch** first, so you resolve any conflicts on *your* branch — never on `develop`.

```bash
git fetch origin
git merge origin/develop
```

If there are **conflicts**, resolve them now, then `git add` the resolved files and `git commit`.

### Step 5 — The gate: build + verify the *integrated* result

This is the most important step and the easiest to get wrong. After integrating `develop`, run the full check suite **again** — on the merged state. New code from `develop` can break your branch even if both worked separately.

```bash
pnpm typecheck      # all packages must pass
pnpm test           # all tests must pass
pnpm build          # all apps must build (this is the real gate)
```

> **Build *after* integration, not before.** The state you are about to merge is the integrated state — so that is the state that must build green. If anything fails: fix it on your feature branch and repeat from Step 4. **Do not proceed to Step 6 with a red build.**

> **If you hit a 404-on-every-route or a weird stale build during this step**, it's usually a corrupted Turbopack cache. Run `pnpm --filter @jobportal/web clean` (and `@jobportal/recruiter`) to wipe `.next`, then re-run the build.

### Step 6 — Merge into `develop` and push

Only once the integrated build is green:

```bash
git checkout develop
git pull                      # make sure develop is current
git merge --no-ff feature/<short-name> -m "Merge feature/<short-name> into develop"
git push origin develop
```

We use `--no-ff` so the merge commit preserves the history of the feature as a unit.

### Step 7 — Keep the branch (do **not** delete it)

> **Project rule (owner preference):** after a successful merge, **do NOT delete the feature branch** — leave it on both local and remote. Branches accumulate on purpose; the owner prunes them manually if/when desired. (This overrides the generic "delete after merge" advice you may see elsewhere.)

### Step 8 — Update `PROGRESS.md`

`PROGRESS.md` is the running log of everything that ships to `develop`. After a substantive merge, add a short entry (what shipped, any follow-ups). Easiest is to bundle this into the same branch *before* Step 6; otherwise do it in a small `chore/update-progress` branch afterward.

---

## 3. Visual summary

```
git checkout develop && git pull
        │
        ▼
git checkout -b feature/x        ── Step 1: branch from latest develop
        │
   (write code, small commits)   ── Step 2
        │
pnpm typecheck && pnpm test      ── Step 3: verify own work
git push -u origin feature/x
        │
git fetch && git merge origin/develop   ── Step 4: integrate latest develop
   (resolve conflicts if any)
        │
pnpm typecheck && test && build  ── Step 5: THE GATE (build the integrated state)
        │  red? → fix on feature/x, back to Step 4
        │  green ↓
git checkout develop && git pull
git merge --no-ff feature/x      ── Step 6: merge + push
git push origin develop
        │
   keep the branch (Step 7) + update PROGRESS.md (Step 8)
```

---

## 4. Hotfixes (production emergencies only)

A hotfix branches from `main`, not `develop`:

```bash
git checkout main && git pull
git checkout -b hotfix/<short-name>
# fix, commit, run the full gate (Step 5)
git checkout main && git merge --no-ff hotfix/<short-name> && git push origin main
# then back-merge into develop so the fix isn't lost:
git checkout develop && git merge --no-ff hotfix/<short-name> && git push origin develop
```

---

## 5. Quality gates — what "green" means

Run from the repo root; Turborepo runs the task across every workspace.

| Command | Checks |
|---|---|
| `pnpm typecheck` | TypeScript strict mode across all apps + packages. Must be 0 errors. |
| `pnpm test` | Vitest unit tests across packages + apps. Must all pass. `packages/db` also carries Postgres-backed tests for `advanceSequence` — they run on a throwaway table when a local database is reachable and **skip with a reason on stderr** when it is not, so this stays green without `pnpm infra:up`. Run infra up if you touch sequence handling. |
| `pnpm build` | Production build of all five apps. Must succeed. |
| `pnpm lint` | ESLint where configured. |

TypeScript runs in **strict** mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` on. No `any` without a justification comment. Coverage target is 80% on `packages/*`.

---

## 6. Working with Claude Code

This project is developed with Claude Code. To keep Claude aligned with this workflow, start each session by having it read `CLAUDE.md` (auto-loaded), `PROGRESS.md`, and `ARCHITECTURE.md`. A good per-feature prompt:

```
Implement <feature> per SRS §<X.Y>. Branch from develop as feature/<short-name>.
Read the SRS section first and surface a plan (files, migrations, flags) before
coding. Follow the workflow in DEVELOPMENT.md: integrate develop, run the full
build gate on the integrated result, then merge to develop. Do not delete the
branch after merge. Reference SRS §X.Y in commit messages.
```

Claude will surface a plan before writing code — review it, then let it proceed.

---

## 7. The golden rules (memorize these)

1. **Never** commit to `main` or `develop` directly — always a typed branch.
2. Branch from the **latest** `develop` (pull first).
3. Integrate `develop` into your branch **before** the final build, not after.
4. The **build gate runs on the integrated state** — green build is non-negotiable before merging.
5. Merge with `--no-ff`, push `develop`, **keep the branch**.
6. Update **`PROGRESS.md`** for every substantive merge.
7. Reference the **SRS section** in feature commits; keep commits small and focused.
8. Never commit secrets or `.env` files.

---

*If this workflow changes, update this file and CLAUDE.md §11 together in the same commit.*
