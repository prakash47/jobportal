# MASTER PROMPT — Paste this at the start of every JobPortal session

> **Why this exists:** Claude Code does **not** remember anything between sessions — every new session starts from zero (it only auto-loads `CLAUDE.md`). This master prompt bootstraps a fresh session: it makes Claude read all the team docs, sync with `develop`, and lock in the pull → claim → build → merge → push workflow before you start any task.
>
> **How to use:** Open Claude Code in the `jobportal/` folder. Paste the block below as your **first message** of the session. Then describe your task.

---

## ▶️ The Master Prompt (copy everything in this block)

```
You are continuing development on the JobPortal project as one of 3 developers
working in parallel with Claude Code, each on their own machine + own local
Postgres, all merging to a shared `develop` branch.

CLAUDE.md is auto-loaded. Before doing anything else, BOOTSTRAP this session:

1. Read these files now, in order, and hold them as binding context:
   - CLAUDE.md           (engineering rules; §11 branching, §15 team coordination)
   - PROGRESS.md         (what has already shipped to develop)
   - WORKLOG.md          (the live "who is building what right now" board)
   - COLLABORATION.md    (schema/migration discipline, naming, conflict rules)
   - DEVELOPMENT.md      (the branch → integrate → gate → merge workflow)

2. Sync with the team:
   - git checkout develop && git pull
   - If a teammate added a migration: pnpm db:generate && pnpm db:migrate:dev
     (if `migrate dev` hangs but the migration row already applied, stop it and
      just run pnpm db:generate)

3. Report back to me before any task:
   - current develop tip (last 3 commits)
   - anything In Progress / Planned in WORKLOG.md (and who owns it)
   - any held shared-surface locks
   - whether dependencies/migrations were already in sync or needed action

Then WAIT for my task. Do NOT start coding until I give you one.

When I give you a task, follow CLAUDE.md §15 coordination WITHOUT being reminded:
- Check WORKLOG.md for overlap with my task. If someone already claimed it,
  STOP and tell me before coding (proceed / coordinate / pick something else).
- If the task touches a shared surface (packages/db/prisma/schema.prisma,
  packages/ui/src/styles/theme.css, packages/types, feature-flags/keys.ts, or a
  barrel index.ts), take the lock in WORKLOG.md first.
- Claim the work in WORKLOG.md (name the models/components/endpoints), commit +
  push that claim early.
- grep the schema before creating any Prisma model; never duplicate an existing
  table — extend it. Always name migrations: prisma migrate dev --name <clear_name>.
- Use Tailwind utilities + theme.css tokens (never invented CSS classes or
  hardcoded hex). Make HTML ids unique via useId().
- Branch from develop as feature/<short-name>. Surface a file/migration/flag
  plan BEFORE writing code, then wait for my go-ahead.

When the work is done, follow DEVELOPMENT.md to finish:
- Integrate develop into my branch (git fetch && git merge origin/develop),
  resolve conflicts.
- Run the FULL gate on the INTEGRATED state: pnpm typecheck && pnpm test &&
  pnpm build. Fix anything red before merging.
- Merge to develop with --no-ff and push.
- Update WORKLOG.md (move my row to Recently merged, release my locks) and add a
  PROGRESS.md entry. Do NOT delete the branch (owner preference).

Confirm you've completed the bootstrap (steps 1–3) and are waiting for my task.
```

---

## After the bootstrap — task & finish prompts

Once the session is bootstrapped, you usually just describe your task in plain words and Claude will follow the protocol. If Claude ever drifts, use these short nudges:

- **Start a specific feature:**
  `Task: <feature/bug>. Coordinate per CLAUDE.md §15 — check WORKLOG for overlap, take any needed lock, claim it, then surface a plan before coding.`

- **Finish & merge:**
  `Finish per DEVELOPMENT.md: integrate develop, run the full gate on the integrated state, merge --no-ff to develop, push, update WORKLOG + PROGRESS, keep the branch.`

- **Mid-task course-correct (one-liner):**
  `Coordinate per CLAUDE.md §15.`

---

## Notes

- This file is **git-tracked** — every developer gets it on `git pull`. Share it with the team.
- The master prompt is intentionally explicit because **a fresh Claude session has no memory of past sessions** — it cannot "already know" the workflow beyond what CLAUDE.md auto-loads. Pasting this guarantees the full protocol runs.
- Owner's machine note: `gh` CLI isn't installed; pushes use git directly, no PR review step.

*If the workflow changes, update this prompt and `TEAM_QUICKSTART.md` together.*
