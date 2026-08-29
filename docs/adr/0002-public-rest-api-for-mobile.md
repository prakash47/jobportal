# ADR 0002 — Public REST API for the CQ mobile app

- **Status**: **Accepted** — architecture settled, and all 8 sub-decisions answered by the owner on 2026-08-08 (see §Decisions taken). Ready to build.
- **Date**: 2026-08-08
- **Deciders**: Prakash (owner). Requested by the CQ mobile team (Flutter, separate `cq-mobile` repo — they do not commit here)
- **SRS**: §4.1 (search), §4.2 (job detail), §4.7 (companies), §4.8 (career advice), §4.12 (auth)
- **Source**: `API_SPEC_FOR_MOBILE.md` (mobile team, 2026-08-06), verified against this codebase 2026-08-08

> Note (updated 2026-08-29): **resolved — this ADR is now tracked and pushed.** The
> `!/docs/adr/` carve-out proposed here was added by
> `feature/sadmin-roles-permissions` (2026-08-22, `.gitignore:180-181`), and the file
> was committed on the owner's instruction, so it reaches the other two developers and
> a fresh clone on the next `git pull` rather than by hand. Everything else under
> `docs/` — including the SRS PDF — deliberately stays local.

## Context

The mobile app already works against every authenticated endpoint that exists today
(profile, saved jobs, applications, alerts). The remaining job-seeker surfaces — job
search, job detail, companies, career advice, home feed — have **no REST reader**, so the
app cannot render them. The mobile team sent a spec asking for 9 endpoints, framing each
as *"a thin REST wrapper over the exact same query/loader the SSR page already runs"*.

That framing is **wrong about this codebase**, and the correction drives everything below:

- **`apps/web` never calls `apps/api` for this data.** It is server-rendered and imports
  `@jobportal/search` and Prisma **in-process**. There is no HTTP layer to wrap.
- **`apps/api` cannot import `apps/web`** — no dependency in `apps/api/package.json`, no
  path alias in `tsconfig.base.json`, and `apps/api/tsconfig.json` includes only
  `src/**/*.ts`. Every helper the spec names as reusable (`parseSrpSearchParams`,
  `visibility.ts`, `slug.ts`, `loadCompany`, `loadHomePageData`, `renderArticleMarkdown`)
  lives in `apps/web` and is structurally unreachable.
- The API has **zero public read routes** today. All 36 controllers are `me/*`,
  `recruiter/*`, `admin/*`, `auth/*`, `media`, `webhooks` or `alerts/unsubscribe`.

Verification method: 8 parallel read-only agents checked the spec claim-by-claim against
the code. **148 findings; 48 of the spec's claims returned wrong or partial.** The spec is
otherwise unusually accurate — its file paths and line numbers are right in ~7 of 8 cases.

Two findings invert the plan's assumptions:

1. **Apply already works.** `POST /me/applications`
   (`apps/api/src/applications/applications.controller.ts:52-65`) is complete — two-layer
   quota, duplicate-409 that does not burn a slot, email-verification and ACTIVE-job
   gates, candidate email, recruiter notification. `apps/web` itself applies through it
   (`ApplyButton.tsx:107`); there are **zero** `'use server'` actions in the repo. Mobile
   apply needs **no backend work**. `JwtAuthGuard` also already accepts
   `Authorization: Bearer` (`jwt-auth.guard.ts:13-16`).
2. **The app cannot obtain a token — and the spec never mentions it.** Register, login,
   refresh and reset-password return `{ user }` and emit tokens **only** via `Set-Cookie`;
   `/auth/refresh` reads the refresh token exclusively from the cookie
   (`auth.controller.ts:183`). The app can present a credential it has no way to acquire.
   **This gates all nine endpoints.**

## Decision

**1. Add a public REST surface to `apps/api`** — new NestJS modules, guards simply
omitted (guards are per-controller here, never global). Routes sit at the API root; there
is no global prefix today. Seven of the nine are net-new modules (controller + service +
Zod DTO + response mapper + tests), not wrappers.

**2. Extract shared domain logic into a new package FIRST, as its own PR**, before any
endpoint. Six endpoints depend on the same five `apps/web` modules. Built in the spec's
order, each PR copy-pastes what it needs and the repo ends with the SRP param mapper, slug
parsers, visibility rules and home taxonomy duplicated — silently drifting from the
website forever. Candidates, all verified import-pure or near-pure:

| Module | Lines | Imports | Unblocks |
|---|---|---|---|
| `lib/url/slug.ts` | 95 | none | `/jobs/:slug`, `/companies/:handle`; also kills the duplicate slugify in `recruiter-jobs.service.ts:37-45` |
| `lib/job/visibility.ts` | 59 | `@jobportal/db`, `@jobportal/auth` (both already API deps) | `/jobs/:slug` |
| `lib/srp/params.ts` (parse half) | ~70 | one type from `@jobportal/search` | `/jobs` |
| `lib/companies/params.ts` | 54 | none | `/companies` |
| `lib/cms/params.ts` | 28 | none | `/career-advice` |
| `lib/home/queries.ts` | ~200 | `@jobportal/db` + `react` `cache` (drop the wrapper) | `/home` |

Do **not** put these in `packages/types` (a 4-line stub today). Create a new package with
subpath exports from day one. Both `packages/*` additions and `tsconfig.base.json` are
shared surfaces — take the WORKLOG locks per CLAUDE.md §15.3.

**3. Fix the API contract before the first controller, not after the ninth.** Add a
version prefix and one consistent error shape. A website is rolled forward instantly; an
**installed app cannot be**, so retrofitting either after v1.0 breaks every user who has
not updated. Nest already normalises most errors into one envelope; exactly one path is
off-contract (the apply-quota 429 at `quota.service.ts:148-158` returns a bare object with
no `statusCode`). Neither 429 path emits `Retry-After`.

**4. Mobile token issuance via a separate `/auth/mobile/*` route pair**, reusing
`AuthService.issueSession()` — the same trust boundary ADR 0001 converged on. Chosen over
adding a body-token mode to the existing `/auth/*` (which the three web apps depend on)
because it cannot break the browser contract. This is a **deliberate documented divergence
from CLAUDE.md §9**, which mandates HttpOnly cookies: a native client has no cookie jar by
default, so the refresh token must be accepted in the request body on this surface.

**5. Build order** (differs from the spec's in two material places):

| # | Work | Size | Why here |
|---|---|---|---|
| 0 | Provision hosting (parallel, day 1) | — | Longest lead time, zero code dependency |
| 1 | Answer the 8 open decisions | — | Code cannot start without them |
| 2 | Version prefix + error envelope | ½ d | Cannot be retrofitted post-launch |
| 3 | Mobile token issuance | 1–2 d | Gates every authenticated screen |
| 4 | Shared-domain extraction | 1 d | Prevents permanent web/mobile drift |
| 5 | `GET /jobs` + `GET /jobs/:slug` | 2 d | Biggest single unblock (spec agrees) |
| 6 | `/skills` `/cities` `/industries` | ½ d | **Promoted**: `GET /me/profile` returns bare ids, so the profile screen needs these — not just filters |
| 7 | `/companies` + `/companies/:handle` | 2 d | |
| 8 | `GET /home` | 1 d | **Demoted from 3rd**: it is a *composite* of job + company cards. Shipping it first freezes two card shapes that `/jobs` (ES-shaped, paise + months) and `/companies` (Prisma-shaped, years) would then contradict — three near-identical objects with different units in one v1, on installed binaries |
| 9 | `/career-advice` + `/:slug` | ½–4 d | Last: holds the only real schedule risk (see §Open decisions 3) |
| 10 | `/me/applications` additive fields | 2–4 h | The one genuinely thin item |

Total: **9–13 focused backend days**, excluding provisioning and push notifications.

## Alternatives considered

- **Point the app at the website's SSR routes / add Next route handlers in `apps/web`** —
  rejected: duplicates the API's auth model, and CLAUDE.md §3.2 makes `apps/api` the BFF.
- **A separate mobile BFF service** — rejected: a fourth deployable for one client, and it
  would need the same extraction anyway.
- **Duplicate the logic per endpoint inside `apps/api`** — rejected: this is exactly the
  drift the extraction PR exists to prevent.
- **Return pre-formatted display strings** (`"₹12.5 LPA"`, `"3 days ago"`) — rejected, and
  the spec agrees: it freezes locale server-side and turns copy tweaks into deploys.
  Formatting is app-side (`apps/web/lib/job/format.ts` is the reference to port to Dart).

## Decisions taken

All eight answered by the owner on **2026-08-08**. Four were put to the owner as genuine
forks; four were taken as defaults with the owner informed. The mobile team asked to be
told about each divergence — items 3, 4, 5, 6 and 7 belong in that reply.

**Three of these change the live website, not just mobile** — items 5 and 7 are
user-visible, and item 6 fixes a website bug. Called out in Consequences below.

1. **Token transport → separate `/auth/mobile/*`.** *(Owner fork — approved.)* Login and
   refresh return the tokens in the response body; refresh accepts the token in the body.
   Reuses `AuthService.issueSession()`; the existing `/auth/*` the three web apps depend
   on is byte-untouched. **This is a deliberate, owner-approved divergence from
   CLAUDE.md §9** (HttpOnly cookies) — a native client has no cookie jar. The rejected
   alternative was a Dart cookie jar with zero backend work: fragile, breaks the moment
   `COOKIE_DOMAIN` changes, and not how phone apps normally work.
2. **Version prefix + error envelope → yes, before the first controller.** *(Default
   taken.)* Fix the one off-contract body (the apply-quota 429 at
   `quota.service.ts:148-158`, which returns a bare object with no `statusCode`) and emit
   `Retry-After` on both 429 paths. Cannot be retrofitted once binaries are on phones.
3. **Article/JD body → raw markdown.** *(Owner fork — approved.)* Return `Article.body`
   as-is; the Flutter side renders it. **~2 hours instead of 2–4 days**, and it avoids
   pulling 7 **ESM-only** deps into a **CommonJS** Nest build (`apps/api/tsconfig.json`
   `"module": "commonjs"`), an unresolved `require(ESM)` spike, ~12 MB of image growth
   (`@shikijs/langs` is 8.4 MB / 694 grammars), a seconds-long Shiki cold start (the
   repo's own test wraps warmup in a 30 s timeout), and a Redis cache to replace the SSG
   the web page relies on. **Accepted trade-off:** no syntax highlighting on mobile, and
   sanitisation posture moves to the client — so the app must not render raw HTML.
   `apps/web` keeps its existing pipeline unchanged.
4. **Page size → 20 on every API list endpoint.** *(Default taken.)* The website keeps
   its own values (companies 24, career advice 12) — the API simply does not inherit them.
5. **Home-feed numbers → fix both.** *(Owner fork — approved, and this changes the live
   website.)* `hiringTeams` does not exist; the field is renamed to `recruiters`, which is
   what it actually counts. `counts.companies` stops being an unfiltered `company.count()`
   and counts only companies with ≥1 ACTIVE job. **The website's hero ribbon number will
   go down** — accepted, because the current one is not true.
6. **`emp` / `mode` filters → build them (~half a day).** *(Default taken.)* The spec's
   stated reason is stale: `schema.prisma:1018-1019` already has `employmentType` and
   `workMode`; only the ES doc field, the transform and a reindex are missing
   (`params.ts:52-55` carries the outdated comment). **This also repairs a live website
   bug** where both facets round-trip in the URL and filter nothing.
7. **Resume on apply → require it, and snapshot it.** *(Owner fork — approved, and this
   changes the live website.)* `apply()` gains a resume check (a new 403 the app and the
   web `ApplyButton` must both handle), and the application records which resume was used
   at apply time. Today nothing requires a resume (`applications.service.ts:47-103` checks
   only emailVerified / ACTIVE / duplicate), and `Application.resumeUrl`
   (`schema.prisma:1109`) is **never written anywhere in the repo**, so recruiters always
   see the candidate's *current* resume and replacing it rewrites every past application.
   **Needs a schema migration** (`resumeId` FK preferred over the dead `resumeUrl` string)
   → takes the `schema.prisma` lock per CLAUDE.md §15.3. **Existing applications cannot be
   backfilled** — the historical resume is genuinely unknown, so old rows keep the current
   behaviour and only new applications carry a snapshot.
8. **Store-compliance surfaces → scheduled as launch blockers.** *(Not a fork — both are
   mandatory.)* No privacy-policy page and no account-deletion endpoint exist; Apple and
   Google reject without both, regardless of feature parity. The endpoint is backend work;
   **the policy text needs the owner's company details and is not something the code can
   produce.**

### Consequences of the answers (new scope not in the original estimate)

The owner's answers to items 5 and 7 reach beyond mobile:

- **A schema migration is now in scope** (item 7) that the 9-endpoint estimate did not
  include — takes the `schema.prisma` lock, so it must be sequenced against whatever the
  other two developers are doing.
- **`apps/web`'s apply flow changes** (item 7). `ApplyButton` must handle a new
  "no resume" 403 and route the user to upload one. The original plan claimed `apps/web`
  would be untouched; that is no longer true.
- **The website homepage number changes** (item 5). Whoever owns that copy should know the
  hero ribbon figure will drop.
- **Net effect: roughly +1 day** on the 9–13 day estimate, plus the web apply-flow change.
- **Item 3 removes** the single biggest schedule risk (2–4 days → ~2 hours).

## Consequences

**Positive**

- `searchJobs` (`packages/search`) is genuine reuse — already an API dependency, already
  used by `alerts.processor.ts:4`.
- The extraction repays the website too: one slug parser instead of two, and the
  `emp`/`mode` fix (open decision 6) repairs a live SRP bug.
- Once tokens are issued, the **entire** authenticated surface works unchanged — every
  job-seeker controller already sits behind the Bearer-capable guard.
- Route names are all free (no global prefix, no collisions).

**Negative / risks**

- **Job visibility must be ported carefully.** `apps/api` has recruiter *ownership* checks
  but nothing deciding public readability. A naive `/jobs/:slug` serves **DRAFT and
  PENDING_MODERATION** jobs to anyone — and moderation is ON in every environment. The
  308 slug-drift redirect must also run **after** the visibility check, or the `Location`
  header leaks an unapproved job's title to an anonymous caller who guessed the id.
- **Do not spread client query params into `searchJobs`.** It **defaults** to ACTIVE
  (`searchJobs.ts:32`, `status ?? 'ACTIVE'`) rather than forcing it, and `status` is
  caller-overridable (`types.ts:69`). Pin it server-side.
- **Company logos are unusable from a phone.** `StorageService.getPublicUrl()`'s result is
  written *into* `Company.logoUrl` (`recruiter-profile.service.ts:252-255`), and with
  `R2_PUBLIC_URL` blank every stored value reads `http://localhost:4000/media/...`.
  Provisioning R2 later does **not** fix existing rows — needs a backfill migration, and
  ideally a move to storing keys and resolving at serialize time.
- **The rate limiter will lock out everyone.** A global `ThrottlerGuard` (100/min, keyed
  on `req.ip`, `auth.module.ts:20,34`) runs with **`trust proxy` never set**
  (`main.ts:13-46`). Behind Render/Fly/Cloudflare, `req.ip` is the proxy — the entire
  internet shares one bucket, and a Flutter cold start is 5–8 requests. Indian carrier
  CGNAT makes IP-keyed limiting a poor fit even after the fix. It also silently corrupts
  the per-IP login throttle and every session audit row.

  > **Shipped 2026-08-08 on `bugfix/trust-proxy-client-ip` — and it was NOT a one-line fix.**
  > The literal one-liner, `app.set('trust proxy', true)`, is *worse than the bug*: it tells
  > Express to believe the entire `X-Forwarded-For` chain, so any client can send its own
  > header and become any address it likes. That does not weaken the 100/min limiter, it
  > removes it — an attacker rotates the header and never shares a bucket with itself — and it
  > lets an attacker write arbitrary values into `Session.ipAddress`. Measured on the running
  > app: with `true`, a request carrying `X-Forwarded-For: 1.1.1.1, 203.0.113.50` recorded
  > **1.1.1.1**; with a hop count of `1` the same header recorded **203.0.113.50**, the real
  > edge address.
  >
  > The correct value is a property of the deployment (how many proxies actually sit in front
  > of the process), which does not exist yet — so it ships as a parsed `TRUST_PROXY` env var
  > defaulting to Express's own `false`, i.e. byte-for-byte today's behaviour, plus a boot
  > warning when `NODE_ENV=production` and it is unset. **Whoever provisions hosting must set
  > it**: `1` for Render/Fly alone, `2` with Cloudflare in front. Rationale and parser in
  > `apps/api/src/common/trust-proxy.ts`.
- **No bulk saved/applied state.** `/jobs` hits carry no `isSaved` marker and nothing
  resolves it in bulk (`findUserSaved` exists but is unexposed,
  `saved-jobs.service.ts:52-56`). Without it the app makes 20 extra calls per page. Small
  (~2–3 h) but it **changes the `/jobs` response shape**, so scope it before step 5.
- **Elasticsearch becomes a hard runtime dependency** for `/jobs` with no Postgres
  fallback; the website has the same weakness. A cold-start empty list reads as a broken
  app. Either add a fallback or give the app a documented error contract.
- **`/me/applications` deepens an existing fork.** `ApplicationsService.list()` and the
  website's `/applications` page run *separate* Prisma queries with different selects. The
  additive fields are genuinely backward-compatible, but they will not reach the website.
- CLAUDE.md §9's upload baseline stays aspirational: **ClamAV is a stub**
  (`clamav.service.ts:15-21`) returning CLEAN for everything but a sentinel filename.
  Opening a second upload client is the moment to provision the real daemon.

**Deferred / not budgeted**

- Push notifications — no infrastructure of any kind exists (no device-token table).
- A client-readable feature-flag projection. The only flag route is admin-guarded, so the
  app will hardcode screens the web can kill. Note `feature.resume_download_pdf` is seeded
  off, so "view my resume" 403s for every user on day one.
- Candidate notification feed (none exists in any layer).
- OpenAPI/Swagger — the mobile team has no contract to generate a Dart client from.

**External / blocking, owner-only**

- **Nothing in this repo deploys.** No `render.yaml`, `Dockerfile`, `fly.toml` or
  `vercel.json`, and **no `.github/`** (so no CI to enforce a future contract test).
  Postgres, Redis and ES exist only in `infra/docker-compose.yml`. `/jobs` additionally
  needs a **managed Elasticsearch 9** cluster — the longest procurement tail and the item
  most likely to be discovered late. The app bakes its base URL into the binary, so the
  `api.<domain>` hostname decision precedes the app's build config.
- `RESEND_API_KEY` remains blank — unchanged, unrelated, still a launch blocker.
