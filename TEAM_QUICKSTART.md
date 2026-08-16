# TEAM QUICKSTART — Start Here

> **For:** the 3 developers building JobPortal in parallel with Claude Code.
> **What this is:** the single "start here" page. It links the detailed docs, gives you the **daily workflow**, and — most importantly — the **exact Claude Code prompts** to paste so Claude follows our team process automatically.
>
> Read this once. Then keep `WORKLOG.md` open while you work.

---

## The 5 docs (and when to read each)

| Doc | Read it when |
|---|---|
| **[ONBOARDING.md](./ONBOARDING.md)** | First time on your machine — clone → running local stack. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Once, to understand what the system is. |
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | The git branch → merge workflow. |
| **[COLLABORATION.md](./COLLABORATION.md)** | How 3 devs avoid duplicate work + conflicts (schema locks, naming). |
| **[WORKLOG.md](./WORKLOG.md)** | **Every session + before every new task.** The live "who's building what" board. |

`CLAUDE.md` (auto-loaded by Claude Code) is the binding rule set; §15 is the coordination protocol Claude enforces for you.

---

## One-time setup (new machine)

Full detail in **[ONBOARDING.md](./ONBOARDING.md)**. The short version:

1. Install: **Node 24**, **pnpm 10**, **Docker Desktop**, **Git**, **Claude Code**, (optional) **GitHub CLI**.
2. Get added as a collaborator on the GitHub repo; `gh auth login` (or set up git credentials).
3. Clone → `git checkout develop` → create `.env` at root **and copy the SAME file into all four runtime apps**: `apps/api`, `apps/web`, `apps/recruiter`, **`apps/sadmin`**. (`apps/services` needs none — it reads no env.) Every app loads `.env` from its own directory, never the repo root. **Do not generate a fresh `JWT_ACCESS_SECRET` per app** — if `apps/sadmin`'s differs from `apps/api`'s, the Super Admin sign-in succeeds and then drops you straight back on the login page.
4. `pnpm install`
5. `docker compose -f infra/docker-compose.yml up -d`
6. Database, **in this order**: `pnpm db:generate` → `pnpm db:migrate:dev` → `pnpm db:seed` → `pnpm --filter @jobportal/db db:seed:demo:full`
7. Run (4 terminals): `pnpm --filter @jobportal/api dev` · `pnpm --filter @jobportal/web dev` · `pnpm --filter @jobportal/recruiter dev` · `pnpm --filter @jobportal/sadmin dev`
8. Open http://localhost:3000 (Super Admin: http://localhost:3003/sadmin)

> If anything fails, the **Troubleshooting** table in ONBOARDING.md Part J covers every gotcha we've hit.

---

## The daily workflow (memorize this loop)

```
1. git checkout develop && git pull        # latest code + WORKLOG + PROGRESS
2. pnpm db:generate && pnpm db:migrate:dev  # apply any new migration a teammate added
3. read WORKLOG.md                          # who's building what? any locked files?
4. claim your work in WORKLOG.md            # + lock shared files if you'll edit them; commit + push
5. git checkout -b feature/<name>           # branch from fresh develop
6. build it  (small commits, named migrations, design tokens, unique ids)
7. git fetch && git merge origin/develop    # integrate teammates' work INTO your branch
8. pnpm typecheck && pnpm test && pnpm build # THE GATE — on the integrated result
9. git checkout develop && git merge --no-ff feature/<name> && git push origin develop
10. update WORKLOG (move to merged, release locks) + PROGRESS.md ; keep the branch (don't delete)
```

**Steps 1–4 are the rule that prevents duplicate work and conflicts.** Pull often. Claim before you build.

---

## The 4 rules that prevent 90% of our pain

1. **Pull + read WORKLOG before starting anything.** If someone already claimed it, coordinate — don't build it twice.
2. **Lock shared files before editing them** (`schema.prisma`, `theme.css`, barrels, `keys.ts`). One editor at a time. Release on merge. *(See WORKLOG.md → Shared-surface locks.)*
3. **Schema discipline:** `grep` before creating a model; always name migrations (`prisma migrate dev --name add_xyz`); never edit a merged migration.
4. **Naming:** components PascalCase; no invented CSS classes (use Tailwind + theme tokens); HTML ids via `useId()`; `grep` the UI barrel before adding a component.

---

## Claude Code prompts (copy-paste these)

Claude Code auto-loads `CLAUDE.md`, so it already knows the rules. These prompts make it **act** on them. Paste the relevant one at the start of a session / task.

### A) Session start (paste first thing, once per session)
```
Starting a JobPortal session. Before any task:
1. Read CLAUDE.md (auto-loaded), PROGRESS.md, and WORKLOG.md.
2. Run: git checkout develop && git pull
3. Apply any new DB migration: pnpm db:generate && pnpm db:migrate:dev
4. Tell me the develop tip, anything in-progress in WORKLOG, and any locked shared files.
Then wait for my task. Follow the §15 coordination protocol for all work.
```

### B) Starting a new feature / bug fix (paste when you have a task)
```
Task: <describe the feature or bug>.
Follow CLAUDE.md §15 coordination:
1. Pull develop, read WORKLOG.md, and check if this overlaps anything already
   claimed by another dev. If it overlaps, STOP and tell me before coding.
2. If it touches the DB schema, theme tokens, a barrel, or feature-flag keys,
   take the shared-surface lock in WORKLOG.md first.
3. Claim the work in WORKLOG.md (name the models/components/endpoints), commit + push that.
4. Branch from develop as feature/<short-name>. grep the schema before creating any
   model. Name any migration with --name. Use design tokens + useId() for ids.
5. Surface a file/migration/flag plan before writing code, then wait for my go-ahead.
```

### C) Finishing / merging (paste when the feature is done)
```
The feature is done. Follow DEVELOPMENT.md + CLAUDE.md §15 to finish:
1. Integrate develop into my branch (git fetch && git merge origin/develop), resolve conflicts.
2. Run the full gate on the integrated state: pnpm typecheck && pnpm test && pnpm build.
   If anything fails, fix it before merging.
3. Merge to develop with --no-ff and push.
4. Update WORKLOG.md (move my row to Recently merged, release any lock I held) and
   add a PROGRESS.md entry. Do NOT delete the branch.
```

### D) Course-correct mid-task (if Claude forgets to coordinate)
```
Coordinate per CLAUDE.md §15.
```
(Claude will re-read WORKLOG.md, check for overlap with the current task, claim it / take locks, and flag any conflict.)

---

## How the `.md` files stay in sync (important — no extra tool needed)

`CLAUDE.md`, `PROGRESS.md`, `WORKLOG.md`, and all the guide docs are **committed to git**. They sync to every machine automatically on `git pull` / `git push`. There is nothing to install. The only discipline required is human: **pull at session start, update WORKLOG as you work, push when you merge.** The more often everyone pulls, the smaller the chance two people claim the same work.

*(Only `docs/` — the SRS PDF + strategy notes — is git-ignored and stays local by design.)*

---

*Questions or a rule that isn't working? Change it in a `docs:` commit and tell the team — these docs are version-controlled like everything else.*
