# What the CQ mobile app needs from the website & backend

**20 August 2026 · verified against `origin/develop` (including last night's 47 commits)**

The Flutter app is code-complete for the seeker journey: 509 tests, analyzer
clean, 61% line coverage. It cannot be released, and **none of the remaining
blockers are in the app**.

Everything below was checked by opening the file, not inferred. Each item says
what to change and what the app cannot do until it lands.

---

## First, the good news

**The API contract is clean.** All 33 route+verb combinations the app calls exist
on `origin/develop` with the correct prefix, and none of last night's 47 commits
changed a request or response shape the app depends on. Nothing you have merged
has broken the app.

---

## Do this one today

### Job alerts are silently burning their own matches

`alerts.processor.ts:128` calls `this.email.sendJobAlert(...)`, which reaches
`ResendClient` directly. With `RESEND_API_KEY` blank the client **logs and
returns void** — success, as far as every caller can tell. Lines 138–142 then
commit:

```ts
lastSentJobIds: persistedIds,
lastSentAt: new Date(),
```

Those job ids are now permanently deduped. **They will never be emailed, even
after the key is provisioned.** Every day this runs, more matches are lost for
good, and the app's own "send test alert" button
(`alerts_repository.dart:112`) burns real matches the same way.

Either provision Resend (below) or pause the alerts queue until you do. This is
the only item on this page that gets worse with time.

---

## Launch blockers

### 1. Transactional email does not send — and it locks users out of applying

`apps/api/src/email/resend-client.ts:22-29` returns early when `RESEND_API_KEY`
is unset. `.env.example:16` ships it empty.

That alone would be a nuisance. What makes it a blocker is
`applications.service.ts:86-95`: **apply is hard-gated on `emailVerified`.** So
the chain is —

> register in the app → `emailVerified = false` → tap Apply → `403 "Verify your
> email before applying."` → the verify sheet's "Send again" returns 204 → no
> email exists → **there is no way past this wall.**

Apply is the app's primary action. Also silently dead: password reset (the app
shows a live countdown for a code that was never sent — `requestCode()` returns
200 for every outcome by design, so nothing surfaces), application-status
notifications, and recruiter invites.

**To fix:** verify a real sending domain in Resend, set `RESEND_API_KEY` and
`RESEND_FROM` to an address on it. The in-code default
`JobPortal <noreply@jobportal.com>` is unverified and Resend will reject it, and
`onboarding@resend.dev` only delivers to your own account address so it is no use
for testers. Set `WEB_URL` at the same time — see the next item.

*Worth 10 minutes while you are in there:* make `ResendClient` throw, or at least
`warn`, in production when the key is missing, so a keyless deploy fails loudly.

**Effort:** 1–2h, configuration only.

### 2. `/verify-email` does not exist on the website

`email-verification.service.ts:26-28` builds the link as:

```ts
const base = process.env.WEB_URL ?? 'http://localhost:3000';
const url = `${base}/verify-email?token=${encodeURIComponent(token)}`;
```

There is no such route in `apps/web`. So even once email sends, **the only CTA in
the verification email is a 404.**

**To fix:** create `apps/web/app/verify-email/page.tsx` as a *public* route — the
person clicking from their inbox is usually signed out. Read `token` from
`searchParams` and call `GET {API}/auth/verify-email?token=…` — **no `/v1`
prefix**, the controller is `@Controller('auth')` and the handler is at
`auth.controller.ts:260-266`. It is not behind `JwtAuthGuard` and returns
`{ ok, userId }`, or 400 for an invalid or expired token. Render success,
expired, and missing-token states.

**Effort:** 0.5 day. No schema, no migration, no flag.

### 3. No web-based account-deletion page

The backend endpoint and the in-app flow both work. Google Play additionally
requires a deletion URL reachable **from the web, without installing the app** —
you cannot complete the Data Safety form without pasting one.

**To fix:** `apps/web/app/delete-account/page.tsx`, a short stable public URL
(not nested under `/settings` — someone who already uninstalled must reach it).
Signed-out visitors get an explanation and a sign-in that returns them here;
signed-in candidates get the typed-`DELETE` confirmation calling
`DELETE /v1/me/account`. Copy must be accurate about what survives —
`account.service.ts:92-93` already documents that this is *not* full erasure.

**Effort:** 1 day. Blocks Play submission, not app functionality.

### 4. No deploy configuration exists anywhere

`git ls-tree -r origin/develop` finds no Dockerfile, no `render.yaml`, no
`fly.toml`, no `vercel.json`, no deploy workflow. `infra/docker-compose.yml` is
local-only — it declares postgres/redis/elasticsearch with dev passwords.

The app's `apiBaseUrl` defaults to `http://127.0.0.1:4000`. **There is no host to
pass to `--dart-define=API_BASE_URL`,** so a release build reaches nothing on any
device but this laptop.

**To fix, at minimum:** a Render/Fly config for `apps/api` with build
`pnpm install --frozen-lockfile && pnpm --filter @jobportal/db db:generate && pnpm --filter @jobportal/api build`,
health check `/health`, and the full env set; Vercel projects for the Next apps;
and a `docs/deployment.md` runbook.

**Effort:** 2–3 days for a first working staging deploy.

### 5. Elasticsearch — provisioning *and* first-run indexing

Two separate problems.

**Absent:** `/v1/jobs` is 100% ES-backed and answers **503**. That is the app's
entire Jobs tab, plus Similar Jobs and the dashboard recommendations row, which
both reuse the same endpoint.

**Present but empty:** `/v1/jobs` returns **200 with `total: 0`**. The app looks
completely healthy and completely empty, with no error anywhere to explain it.
This is the worse failure of the two.

**To fix:** provision ES 9.x and set `ELASTICSEARCH_URL` plus
`ELASTICSEARCH_USERNAME` / `ELASTICSEARCH_PASSWORD` — note
`packages/search/src/client.ts:18-25` only sends auth when **both** are set, so a
half-configured cluster silently connects anonymously. Those two vars are not in
`.env.example`; please add them.

Then make indexing happen: either run `pnpm search:bootstrap && pnpm
search:reindex` as a post-deploy step *before* the API takes traffic, or call
`bootstrapIndexes()` from `onApplicationBootstrap` (it is already idempotent).
Also set `action.auto_create_index: -jobs,-companies,-articles,*`, or publishing a
job before bootstrap mints a concrete index and **poisons the alias permanently.**

**Effort:** 0.5 day to provision, 2h to wire and document indexing.

### 6. Object storage (R2) unconfigured — résumés are lost on restart

Unset, uploads go into a **per-process in-memory Map**, and the download URL
degrades to `local://memory/...`. Worse, `resume.service.ts:88-125` writes the
`Resume` row and sets `Candidate.activeResumeId` *after* the memory put — so the
database keeps insisting a résumé is on file after the bytes are gone.

The app shows a successful upload. The recruiter gets nothing.

**To fix:** create the bucket, set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, and add that host to
`images.remotePatterns` in each Next app — `apps/web/next.config.ts:31-37`
currently allowlists `cdn.jobportal.com`, which is stale branding. Consider
failing boot when R2 is unset in production.

**Effort:** 0.5 day.

### 7. `TRUST_PROXY` unset

`.env.example` ships `TRUST_PROXY=""`, which `parseTrustProxy` treats exactly as
unset. Behind Render or Cloudflare every request appears to come from the proxy,
so the global 100/min throttle becomes **one shared bucket for the entire user
base** — one abusive client locks out everyone — and `Session.ipAddress` records
the proxy on every row.

The code, the boot warning and its tests are already merged. This is one env var.

**Effort:** 5 minutes, once hosting exists.

### 8. Résumé virus scanning is a stub returning `CLEAN`

A public authenticated upload path whose files are then served to recruiters.

**Effort:** 1–2 days (ClamAV sidecar + a socket client in place of the stub).

### 9. Fresh-database provisioning is undocumented

The path exists but two mandatory steps are easy to miss. Please capture it in
the deploy runbook and dry-run it once against a throwaway database.

**Effort:** 0.5 day.

---

## Important, not blocking

| Item | Detail |
|---|---|
| **`endDate` should be nullable** | `apps/api/src/profile/dto.ts:85` is `z.iso.datetime().optional()` — not nullable — so sending `null` is a 400 and **a past job can never be turned into a current one**. Education got this right (`endYear: yearInt.nullable().optional()`). Needs the field plus its four `.refine` predicates. **~45 min.** |
| **`ParseInt32IdPipe` on mobile routes** | You wrote it last night for exactly this bug; it is only on admin/recruiter routes. The app's `applications`, `education` and `experience` controllers still use plain `ParseIntPipe`, so a large id overflows Postgres `int4` and throws a **500** instead of a clean 404. ~18 decorator swaps across 8 files. **~30 min.** |
| **ES sync has no retry** | A failed `syncJob` is logged and forgotten — no retry, no reconciliation sweep. A job silently stops being searchable. **1.5–2 days.** |
| **Production start script** | Depends on devDependencies, and `prisma generate` never runs in the pnpm build. Will bite on first deploy. **3–4h.** |
| **CI** | See below. |

---

## CI — the decision I need from you

The app's `.github/workflows/ci.yml` is written and correct. It **cannot run**,
because GitHub Actions only reads `.github/workflows/` at a **repository root**,
and on GitHub the app exists only as `cq-mobile/` inside this monorepo's
`app/cq-mobile` branch.

Separately: this monorepo has **no CI of its own** — the workflow in
`SETUP_GUIDE.md` is a YAML code block in a markdown file, not a live workflow, and
the `pnpm lint` it references is broken repo-wide.

Two options, and it is your call because it is your repository:

**A — the app gets its own repo** *(my recommendation)*. Its CI runs unchanged, it
gets its own tags and `.aab` release history for Play, and it can be shared with a
reviewer without granting backend access. Your repo is untouched.

**B — a root-level workflow here**, filtered to `cq-mobile/**`. Everything must
move to the repo root and gain `working-directory: cq-mobile`. It would be this
repo's **first** workflow, its runs appear in your Actions tab, and it consumes
this repo's Actions minutes.

Until one of these happens, no automated build or test runs for the app at all,
and **no `.aab` has ever been produced**.

---

## API gaps behind app screens

Not blockers — the screens degrade — but each is small and already mostly built.

| Gap | Reality |
|---|---|
| **Search type-ahead** | The engine, the index field and a working implementation all exist on the website side. It is simply not exposed on `/v1`. **3–4h.** |
| **Career-advice topic counts** | Computed today as inline JS inside the website page component. One raw SQL query plus a controller method. **4–5h.** |
| **Company job filter** | `/v1/jobs` has no company parameter, and `/v1/companies/:handle` caps openings at 10 with no pagination — so the app's company page dead-ends at "Showing 10 of 43". `companyId`/`companySlug` are already indexed; no reindex needed. **~1 day.** |
| **Phone-OTP for seekers** | Does not exist, and **there is no SMS provider anywhere in the repo**. The recruiter OTP flow that exists is relayed manually by staff. Gated by a vendor onboarding measured in weeks, not by engineering. The app's phone screen is hidden behind a flag. |

---

## New gap created by last night's work

`/sadmin/broadcasts` can now write in-app `Notification` rows to
`ALL_CANDIDATES`, and the console reports them delivered. **Nothing can read
them** — the app has no feed screen and no endpoint to build one against, and
`apps/web` has none either. Email broadcasts are unaffected.

`recruiter-notifications.controller.ts` already has the exact four routes needed
(`@Get()`, `@Get('unread-count')`, `@Patch(':id/read')`, `@Post('read-all')`) and
its service implements the paged read, the counts and the ownership-checked
mark-read.

Mount it as `@Controller({ path: 'me/notification-feed', version: '1' })` —
**not** at `me/notifications`, which the app already uses for preferences.

**Effort:** 1–1.5 days. Once it exists I will build the feed screen.

---

## What I am blocked on, specifically

| Your item | What I cannot do |
|---|---|
| API host | Build anything shippable — the app has no host to point at |
| Email + `/verify-email` | Ship at all: users could register and never apply |
| Elasticsearch | Show a single job |
| R2 | Trust that an uploaded résumé still exists |
| Privacy + terms + deletion pages | Make the app's own Terms/Privacy text tappable, or complete either store's forms |
| CI decision | Run a single automated build |

Everything else on the app side is done and pushed to `app/cq-mobile`.

---

*Full item-by-item detail is in `TRACKER.xlsx`. The app-side picture is in
`PUBLISHING_READINESS.md`. Both are in this folder on the `app/cq-mobile` branch.*
