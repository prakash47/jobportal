# COLLABORATION.md — Multi-Developer Playbook

> **Audience:** All developers building JobPortal in parallel with Claude Code (currently 3, each on their own machine with their own local Postgres).
> **Problem this solves:** two people building the same table/feature twice, duplicate Prisma migrations, and clashing component/CSS names — all of which create merge conflicts and wasted work.
> **Companion files:** [`WORKLOG.md`](./WORKLOG.md) (the live board), [`DEVELOPMENT.md`](./DEVELOPMENT.md) (git workflow), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`CLAUDE.md`](./CLAUDE.md) §11–§15.

---

## 0. The one-paragraph summary

We develop in parallel on one shared `develop` branch, each from our own machine. The `.md` coordination files (`CLAUDE.md`, `PROGRESS.md`, `WORKLOG.md`, this file) are **git-tracked**, so they auto-sync on every `pull`/`push` — there is no separate "sync system" to run. To avoid duplicate work and conflicts we rely on four habits: **(1)** always pull `develop` and read `WORKLOG.md` before starting; **(2)** claim your work + lock conflict-prone shared files on `WORKLOG.md`; **(3)** follow strict schema/migration and naming rules; **(4)** integrate `develop` and re-run the build gate before merging. Claude Code enforces all of this — see CLAUDE.md §15.

---

## 1. Why conflicts happen here (and the fix for each)

| Conflict you've seen | Root cause | The fix (this doc) |
|---|---|---|
| Two devs create the same / overlapping **DB table** | No pre-work coordination | §2 claim-before-build + WORKLOG board |
| **Duplicate / clashing Prisma migrations** | Everyone runs `migrate dev` independently; folder names collide | §3 schema-lock + migration naming |
| Same **component / CSS class / id** built twice or clashing | No naming ownership | §4 naming conventions |
| **Merge conflicts** in `schema.prisma`, barrels, `theme.css` | Everyone edits the same hot files | §5 shared-surface locks |
| ".md files feel out of date on my machine" | Misunderstanding — they're git-tracked | §6 (they sync automatically) |

---

## 2. The golden rule: claim before you build

Before writing any code for a new feature, table, or shared component:

1. `git checkout develop && git pull` — get the latest, including the latest `WORKLOG.md`.
2. **Read `WORKLOG.md`.** Is anyone building the same thing? Is a shared surface you need locked?
3. **Claim it** — add a row under *🔨 In Progress* in `WORKLOG.md` naming the concrete models / components / endpoints you'll create.
4. Commit + push that WORKLOG change early (even before you write feature code), so the other two machines see your claim on their next pull.

If you skip this and build something already in progress, **the earlier claimant wins** — the later one rebases onto their work or drops the duplicate. Claiming costs 30 seconds; a duplicate table costs hours.

> **Claude Code does this for you.** Per CLAUDE.md §15, Claude reads WORKLOG.md at session start and before new work, surfaces overlaps, and writes your claim.

---

## 3. Database schema & migrations — the strict rules

This is the **single biggest conflict source**, because every developer has their **own local Postgres** but they all share **one `schema.prisma`** and **one `migrations/` folder** in git.

### 3.1 Lock the schema before editing it
`packages/db/prisma/schema.prisma` is a **shared-surface lock** (see §5). Before adding/altering a model:
1. Take the **DB schema lock** on `WORKLOG.md`.
2. Make your schema change + migration.
3. Merge to `develop`.
4. **Release the lock.**

Only one person changes the schema at a time. This single rule eliminates ~all schema merge conflicts and duplicate-table situations.

### 3.2 Migration naming — always name your migration
Never accept Prisma's blank/auto name (that's how we got `20260518183511_a` and `_jobportaldb` — useless names that hint at uncoordinated work). Always:

```bash
pnpm --filter @jobportal/db exec prisma migrate dev --name <clear_snake_case_name>
# e.g. --name add_saved_search_table
```

Use a descriptive, specific name: `add_<thing>`, `alter_<thing>_<change>`, `drop_<thing>`. The name becomes the folder name in `prisma/migrations/`, so a good name prevents collisions and makes history readable.

### 3.3 Before you create a model — check it doesn't already exist
```bash
# Does a model/table like this already exist?
grep -in "model <Name>" packages/db/prisma/schema.prisma
```
Reuse or extend an existing model rather than creating a parallel one. If you need a field on an existing table, **add the field** — don't make a new table.

### 3.4 When you pull and there's a NEW migration from someone else
Your local DB is now behind the merged schema. Apply it before running:
```bash
pnpm db:generate          # regenerate the Prisma client to match the new schema
pnpm db:migrate:dev       # apply the pending migration(s) to your local DB
```
If `migrate dev` reports drift or wants to reset, **stop and ask** in the team channel before accepting a reset — a reset wipes your local data. (Re-seed afterward with `pnpm db:seed` then `pnpm --filter @jobportal/db db:seed:demo:full`.)

### 3.5 Never edit an already-merged migration
Migrations are immutable once on `develop`. To change something, add a **new** migration. Editing an old one desyncs everyone's `_prisma_migrations` history.

### 3.6 `prisma db push` is forbidden on anything but throwaway local experiments
It bypasses the migration history. Always go through `migrate dev` so the change is captured as a shared migration. (CLAUDE.md §7.)

---

## 4. Naming conventions — so two devs don't collide

### 4.1 Files & code (from CLAUDE.md §10)
- Files: `kebab-case` · Components: `PascalCase` · Utilities/vars: `camelCase`.

### 4.2 Database
- Models: `PascalCase` singular (`SavedSearch`, not `saved_searches`).
- Fields: `camelCase` (`createdAt`, `companyId`).
- Before adding a model/enum, `grep` the schema (§3.3) to confirm it's not already there.

### 4.3 CSS / styling — this is why "class id" clashes happen
- **Do not invent global CSS class names.** We use **Tailwind utility classes** + **design tokens** (CSS variables from `packages/ui/src/styles/theme.css`). There is no shared global stylesheet where two devs can collide on a class name.
- **Never hardcode colors/spacing.** Use the tokens: `text-[var(--color-fg)]`, `bg-[var(--color-bg-elevated)]`, etc. New tokens go in `theme.css` **under the theme lock** (§5) so two people don't define the same variable differently.
- **HTML `id` attributes must be unique on a page.** If you need an `id` (form labels, `aria-describedby`, anchors), prefix it with the component name: `id="apply-form-email"`, not `id="email"`. Better: use React's `useId()` so collisions are impossible.
- New shared UI primitive (Button/Input/etc.)? It goes in `packages/ui` — `grep` the atoms/molecules barrels first so you don't duplicate an existing one (we already hit this with a duplicate `Accordion`).

### 4.4 API routes & feature flags
- API endpoints follow the existing REST shape in `apps/api` — check neighboring controllers before adding a path.
- New feature-flag keys go in `packages/feature-flags/src/keys.ts` (under its lock) following the `services.X` / `feature.X` / `recruiter.X` / `killswitch.X` pattern (CLAUDE.md §4).

---

## 5. Shared-surface locks (the hot files)

Some files are touched by nearly every feature, so simultaneous edits = guaranteed conflict. These are listed in `WORKLOG.md` under **🔒 Shared-surface locks**:

- `packages/db/prisma/schema.prisma` (+ migrations) — **the big one**
- `packages/ui/src/styles/theme.css` — design tokens
- `packages/types/src/*` — shared types/Zod
- Barrel files: `apps/web/components/home/index.ts`, `packages/ui/src/components/*/index.ts`
- `packages/feature-flags/src/keys.ts`

**Protocol:** take the lock on WORKLOG (replace `— free —` with your name+branch+date, push), make the change, merge to `develop`, set it back to `— free —`. A lock is short-lived — minutes to a few hours. If you see a stale lock (claimant clearly done/away), ping them, then clear it.

**Append-only discipline for barrels:** when adding an export, *add a line* rather than reordering — append-only edits rarely conflict even without the lock. Reorders/rewrites need the lock.

---

## 6. The `.md` files already sync — here's how

You asked how to keep the Claude `.md` files in sync across 3 machines. **They already are**, because they're committed to git:

| File | Tracked in git? | Syncs on pull/push? |
|---|---|---|
| `CLAUDE.md` | ✅ | ✅ |
| `PROGRESS.md` | ✅ | ✅ |
| `WORKLOG.md` | ✅ | ✅ |
| `COLLABORATION.md`, `ARCHITECTURE.md`, `ONBOARDING.md`, `DEVELOPMENT.md` | ✅ | ✅ |
| `docs/` (SRS etc.) | ❌ gitignored | ❌ local-only by design |

So the rule is simply: **`git pull` often.** Every pull brings the latest `WORKLOG.md` and `PROGRESS.md` from your teammates; every push shares yours. There is nothing extra to install or run. The only discipline required is the human one: **pull before you start, update WORKLOG as you work, push when you merge.**

> Tip: pull `develop` at least at the start of every session and before every new feature. The more often everyone pulls, the smaller the window for two people to claim the same work.

---

## 7. The daily loop (each developer, each session)

```
1. git checkout develop && git pull            # get latest code + WORKLOG + PROGRESS
2. read WORKLOG.md                              # what's in flight? any locks?
3. claim your work in WORKLOG.md (+ lock shared surfaces if needed); commit + push
4. git checkout -b feature/<name>              # branch from fresh develop
5. build it (small commits; name migrations; use tokens; unique ids)
6. git fetch && git merge origin/develop       # integrate others' work INTO your branch
7. pnpm typecheck && pnpm test && pnpm build    # the gate, on the INTEGRATED state
8. merge to develop (--no-ff), push            # DEVELOPMENT.md §6
9. update WORKLOG (move row to merged, release locks) + PROGRESS.md
10. keep the branch (do NOT delete — CLAUDE.md §11 rule 7)
```

Steps 1–3 are the new coordination habit. Steps 4–10 are the existing DEVELOPMENT.md workflow.

---

## 8. Conflict resolution — when it still happens

Even with discipline, occasional conflicts are normal. How to handle the common ones:

- **`schema.prisma` conflict:** someone edited it without/around the lock. Resolve by keeping **both** models/fields (they're usually additive). Then **regenerate a fresh migration** for your part if yours hadn't merged yet — never hand-merge two migration SQL files. Coordinate so the migration order is linear.
- **Duplicate migration folders** (two `migrate dev` runs): the one already on `develop` wins. Delete your local unmerged migration folder, `pnpm db:migrate:dev` to apply theirs, then regenerate yours on top with a fresh timestamp + clear name.
- **Barrel file conflict** (`index.ts`): almost always both sides just added a line — keep both lines, done.
- **`theme.css` conflict:** keep both token additions unless they define the *same* variable — if so, talk to the other dev and pick one value.
- **Lockfile (`pnpm-lock.yaml`) conflict:** don't hand-merge. Take `develop`'s version, then re-run `pnpm install` to regenerate, commit the result.
- **When unsure:** stop and ask in the team channel. A 2-minute message beats a broken `develop`.

---

## 9. Quick reference card

| Situation | Do this |
|---|---|
| Starting a session | `git pull` develop → read `WORKLOG.md` |
| Starting new work | Claim it in `WORKLOG.md` (+ lock shared surfaces) before coding |
| Changing the DB schema | Take schema lock → `migrate dev --name <clear_name>` → merge → release lock |
| Pulled and there's a new migration | `pnpm db:generate && pnpm db:migrate:dev` |
| Adding a component | `grep` the barrel first; PascalCase; tokens not hardcoded colors; unique ids via `useId()` |
| Adding a feature flag | `keys.ts` under lock, follow the key-naming pattern |
| Finished + merged | Update `WORKLOG` (release locks) + `PROGRESS.md`; keep the branch |
| Hit a conflict | §8 above; when unsure, ask before forcing |

---

*This playbook is itself git-tracked — it reaches every machine on pull. If a rule here stops working for the team, change it in a `docs:` commit and tell everyone.*
