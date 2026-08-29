# Career Queue — Mobile API Contract

> **Audience:** the CQ mobile team (Flutter, separate `cq-mobile` repo).
> **Status:** every endpoint below is **implemented and merged**. Each example was
> captured from a running instance against seeded data on 2026-08-08 — nothing here
> is illustrative or aspirational.
> **Not yet true:** nothing is deployed. There is no hosted base URL yet. Build
> against a local instance or your own mocks and swap the base URL later; the
> shapes will not change under you.

---

## 1. Base URL and the versioning rule

```
<base>            e.g. http://localhost:4000 in development
```

**Read this twice — the `/v1` prefix is NOT uniform, and guessing wrong gives you a 404.**

The API runs Nest's URI versioning with `defaultVersion: VERSION_NEUTRAL`. That means
a route only sits under `/v1` if it explicitly opted in. Every route built for you did;
the pre-existing job-seeker routes the three websites already use did not, because
moving them would have broken those apps in one commit.

| Carries `/v1` | Does **not** carry `/v1` |
|---|---|
| `/v1/auth/mobile/*` | `/me/profile` |
| `/v1/home` | `/me/applications` |
| `/v1/jobs`, `/v1/jobs/{slug}` | `/me/saved-jobs` |
| `/v1/companies`, `/v1/companies/{handle}` | `/me/alerts` |
| `/v1/career-advice`, `/v1/career-advice/{slug}` | `/me/resume` |
| `/v1/skills`, `/v1/cities`, `/v1/industries` | |
| `/v1/me/job-state` | |
| `/v1/me/account` | |

Treat this table as the source of truth. It is not a tidy design — it is the price of
not breaking three shipped web apps — and it is stable.

---

## 2. Authentication

Native clients use a dedicated route pair that returns tokens **in the response body**.
The website's `/auth/*` routes set HttpOnly cookies instead and are not for you.

### `POST /v1/auth/mobile/login`

```json
{ "email": "arjun.iyer+demo@jobportal.dev", "password": "demo-recruiter-pass-2026!" }
```

**200** — captured verbatim, token bodies elided:

```json
{
  "user": {
    "id": 200001,
    "email": "arjun.iyer+demo@jobportal.dev",
    "name": "Arjun Iyer",
    "role": "CANDIDATE",
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs…",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

`expiresIn` is a **duration in seconds**, not an absolute timestamp. That is deliberate:
run your expiry countdown from this duration plus elapsed local time. Comparing an
absolute server timestamp against a device clock breaks on every phone whose clock is
skewed, which is a lot of them.

### The other three

| Route | Body | Notes |
|---|---|---|
| `POST /v1/auth/mobile/register` | `{ email, password, name, phone? }` | Returns the same shape as login, already signed in. `phone` is optional, 7–20 chars. |
| `POST /v1/auth/mobile/refresh` | `{ refreshToken }` | Refresh token goes in the **body**, not a cookie. Rotated on every use — store the new one and discard the old immediately. |
| `POST /v1/auth/mobile/logout` | `{ refreshToken }` | Revokes that session server-side. |

### Email verification on signup — website only, for now

The **website** no longer creates an account until a 6-digit code sent to the
address comes back. Two new endpoints back that flow, and neither is part of the
mobile surface today:

| Route | Body | Returns |
|---|---|---|
| `POST /auth/signup/otp/request` | `{ email, name, signupId? }` | `{ signupId, expiresAt, resendAvailableAt, resendInSeconds }` |
| `POST /auth/signup/otp/verify` | `{ signupId, code }` | `{ verified: true }` |

`POST /auth/register` (the website route) now additionally requires a
`signupId` that has been verified **for that exact address**.

⚠️ **`POST /v1/auth/mobile/register` is deliberately unchanged** and still
creates accounts with no email verification, so the app keeps working as-is.
That is an owner decision, not an oversight. The impact is bounded — applying
already requires a verified email — but until the app implements the two-step
flow, an unverified account can still be created through the mobile route.

Two notes if you do implement it. **`resendInSeconds` is a DURATION**, like
`expiresIn` on login: run the resend countdown from it plus elapsed local time.
Do not subtract a device clock from `resendAvailableAt` — that bakes the phone's
clock skew into the countdown, which is a bug the web client shipped and had to
fix. And the cooldown **429 body carries `resendInSeconds` too**, so a rejected
resend still tells you exactly when to re-arm the button.

**Password rule:** 8+ characters with at least one digit **and** one special character.
A letter is *not* required. Mirror that exactly or your client-side validation will
reject passwords the server accepts.

### Using the token

```
Authorization: Bearer <accessToken>
```

Every authenticated route accepts this. Access tokens last **15 minutes** (`expiresIn: 900`);
refresh tokens last 30 days and rotate on use.

### Social sign-in

Obtain an ID token **on-device** (Google via `google_sign_in`, Apple via Sign in with
Apple) and post it here. Do **not** open `/auth/google` in a webview — that flow is
browser-only: its PKCE handshake lives in an HttpOnly cookie, the session comes back as
`Set-Cookie`, and it finishes by redirecting to the website, so the app gets an error
page and no tokens.

| Route | Body |
|---|---|
| `POST /v1/auth/mobile/google` | `{ idToken }` |
| `POST /v1/auth/mobile/apple` | `{ idToken, name? }` |

Both return the **same shape as login** — user + `accessToken` + `refreshToken` +
`tokenType` + `expiresIn`.

`name` on the Apple route matters: Apple hands you the display name **exactly once**, on
the very first authorisation, and never puts it in the token. Send it on that first call
or the account is named after the email's local part. It is ignored for accounts that
already exist, so replaying it cannot rename anyone.

**Every verification failure is one opaque `401`** — bad signature, wrong audience,
expired, unknown issuer all look identical, deliberately. There is one exception worth
handling separately: Apple omits the email claim on repeat sign-ins, and if we have never
seen that Apple user before we cannot create an account without it. That answers **400**,
not 401, and the fix is for the user to remove the app from their Apple ID and sign in
again.

Accounts link across providers by **verified email**, so signing in with Google and then
Apple on the same address lands on one account. The exception is Apple's **Hide My
Email**: that mints a `@privaterelay.appleid.com` address, which is a different address,
so it creates a separate account. That is inherent to Apple's design.

**Apple is off until configured** — with `APPLE_CLIENT_IDS` unset server-side every
Apple token is rejected. **Google is not quite**: the existing web client ID is accepted
automatically, so a token minted for the *web* client works even before
`GOOGLE_MOBILE_CLIENT_IDS` is set. Tokens minted for your Android/iOS clients will not,
so send us those client IDs and your iOS bundle ID before you test on device.

---

## 3. Errors

One envelope everywhere:

```json
{ "message": "...", "error": "Not Found", "statusCode": 404 }
```

`message` is usually a string, but for validation failures it is a **Zod issue array** —
handle both. Captured from `GET /v1/jobs?page=0`:

```json
{
  "message": [
    {
      "origin": "number",
      "code": "too_small",
      "minimum": 1,
      "inclusive": true,
      "path": ["page"],
      "message": "Too small: expected number to be >=1"
    }
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

Some errors carry **extra top-level keys** beyond the three above. The envelope is
additive by design, so read the ones you need and ignore the rest:

| Extra key | Where | Meaning |
|---|---|---|
| `code` | 403 from `POST /me/applications` | `RESUME_REQUIRED` or `RESUME_SCANNING` — see §5.3 |
| `upgradeAvailable` | 429 from `POST /me/applications` | Daily apply quota spent |

**Branch on `code`, never on `message`.** The prose is server-side copy and will be
reworded; the codes are contract.

| Status | What it means for you |
|---|---|
| 401 | Access token missing/expired → refresh, then retry once |
| 403 | Authenticated but not allowed — read `code` if present |
| 404 | Not found. Job/company/article not-found paths are byte-identical by design, so you cannot distinguish "never existed" from "not visible to you" |
| 409 | Already applied |
| 429 | Rate limited or quota spent. Honour **`Retry-After`** (seconds) when present |
| 503 | Search backend unavailable — retry with backoff, do not treat as empty results |

**503 is not "no results".** `GET /v1/jobs` depends on Elasticsearch with no Postgres
fallback. Rendering an empty list on a 503 makes an outage look like a working app with
no jobs. Show a retry state.

---

## 4. Conventions that apply everywhere

**Pagination.** Every list returns `{ hits, total, page, pageSize }`. `pageSize` is
fixed at **20** on every API list endpoint and is not client-settable. `page` is
1-indexed, max **500** (Elasticsearch's `max_result_window` of 10 000 ÷ 20).

**Units — get these wrong and every salary on screen is off by 10 000 000.**

| Field suffix / name | Unit |
|---|---|
| `salaryMin`, `salaryMax`, `*Paise` | **paise** (₹1 = 100 paise; ₹12 LPA = `120000000`) |
| `minExperienceMonths`, `maxExperienceMonths` | **months** |
| `experienceMinYears`, `experienceMaxYears` | **years** (job detail only) |
| `expiresIn` | **seconds** |

Yes, the list endpoint speaks months and the detail endpoint speaks years for the same
concept. That is the shape the website already uses; it is documented rather than
changed so the two surfaces cannot drift.

**Dates** are ISO 8601 UTC strings (`"2026-08-07T13:51:11.150Z"`).

**No display strings.** The API never returns `"₹12.5 LPA"` or `"3 days ago"` —
formatting is yours, so copy changes do not require a backend deploy. The website's
`apps/web/lib/job/format.ts` is the reference implementation to port to Dart.

---

## 5. Endpoints

### 5.1 `GET /v1/home` — the whole Home tab in one request

Returns `counts`, `topIndustries`, `topRoles`, `popularCities`, `popularSkills`,
`featuredCompanies`, `recentArticles`, `latestJobs`. Cached (`Cache-Control:
public, s-maxage=1800`).

```json
"counts": { "activeJobs": 43, "companies": 12, "recruiters": 8 }
```

`counts.companies` counts only companies with **at least one active job**, not all
companies. The field is `recruiters` — there is no `hiringTeams` field, despite what
the original spec said.

### 5.2 `GET /v1/jobs` — search

Query params: `q`, `skill`, `city`, `industry`, `emp`, `mode`, `expMin`, `expMax`,
`salaryMin`, `postedWithin` (`1|7|30`), `sort` (`relevance|recent|salary_desc`), `page`.
Repeat a key for multi-select: `?skill=go&skill=react`.

**The two facet spellings differ, and this is frozen.** They match URLs the website has
already published, so they cannot be tidied up:

| Param | Accepted values |
|---|---|
| `emp` | `FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `INTERN` — enum spelling |
| `mode` | `on-site`, `hybrid`, `remote` — **lowercase, hyphenated**, *not* the enum |

Unrecognised values are **dropped, not rejected**: `?emp=BOGUS` returns 200 with an
unfiltered list rather than a 400. Do not rely on the API to validate your filter UI.

A hit (captured verbatim):

```json
{
  "id": 100013,
  "title": "Senior Software Engineer — Payments Core",
  "canonicalSlug": "sahaj-pay-senior-software-engineer-payments-core-100013",
  "company": { "id": 3, "name": "Sahaj Pay", "slug": "sahaj-pay", "logoUrl": null },
  "city": "Mumbai",
  "citySlug": "mumbai",
  "salaryMin": 320000000,
  "salaryMax": 550000000,
  "minExperienceMonths": 48,
  "maxExperienceMonths": 96,
  "skills": ["Java", "Kotlin", "PostgreSQL", "Kafka", "Spring Boot"],
  "postedAt": "2026-08-07T13:51:11.150Z",
  "shortDescription": "Build the rails — UPI integration, settlement, reconciliation."
}
```

`logoUrl` is `null` for every seeded company today because no logos have been uploaded.
Design the card for a missing logo — it is the normal case, not an edge case.

### 5.3 `GET /v1/jobs/{canonicalSlug}` — job detail

Pass the whole `canonicalSlug` from a hit. Returns the fields above plus `description`,
`descriptionMarkdown`, `employmentType`, `workMode`, `expiresAt`, `salaryMinPaise`,
`salaryMaxPaise`, `experienceMinYears`, `experienceMaxYears`, `cities`, `skills`
(objects, not strings, here), `company`, `industry`.

A stale slug for a still-visible job answers **308** with the canonical URL in
`Location` — follow it.

### 5.4 `POST /v1/me/job-state` — bulk saved/applied *(auth)*

```json
{ "jobIds": [100013, 100014, 100015] }   // 1–100 ids
```

```json
{ "saved": [], "applied": {} }
```

`saved` is an array of job ids; `applied` maps job id → status string. Use this once per
page of results instead of 20 individual lookups.

### 5.5 Applying *(auth)*

`POST /me/applications` — note **no `/v1`**.

```json
{ "jobId": 100013, "coverLetter": "optional" }
```

**A CV is required.** Two distinct 403s, distinguished by `code`:

| `code` | Meaning | What your UI should do |
|---|---|---|
| `RESUME_REQUIRED` | No usable CV on file | Route to CV upload |
| `RESUME_SCANNING` | CV uploaded, scan not finished | Ask them to retry shortly — **do not** send them to upload again |

Also expect **403** when `emailVerified` is false, **409** for a duplicate application
(which does *not* consume quota), and **429** with `upgradeAvailable` when the daily
quota is spent.

### 5.6 `GET /me/applications` *(auth, no `/v1`)*

Returns `{ hits, counts, total, page, pageSize }`. Optional `?status=`.

```json
"counts": { "APPLIED": 11, "IN_REVIEW": 5, "SHORTLISTED": 2, "INTERVIEWED": 1, "ALL": 19 }
```

**`counts` is deliberately unfiltered by `?status=`** so your filter chips can all show
their own totals while a filter is active. `ALL` is always present; statuses with zero
applications are omitted. Each hit carries `statusHistory` (oldest first) — it can be
empty on older applications, so synthesise the "Applied" step rather than assuming it.

### 5.7 Companies

`GET /v1/companies` — hits carry `id, name, slug, handle, logoUrl, industryName,
hqCityName, averageRating, reviewCount, openRolesCount`.

**Use `handle`, never `slug`, to build the detail URL.** They are different values
(`slug` is `sahaj-pay`; `handle` is `sahaj-pay-overview-3`). Building from `slug`
produces a URL that redirects to itself forever.

`GET /v1/companies/{handle}` adds `description`, `websiteUrl`, `companyType`,
`employeeCount`, `foundedYear`, `activeJobs`, `isVerified`, `highlights`, `openings`,
`reviews`, `relatedCompanies`.

### 5.8 Career advice

`GET /v1/career-advice` → `{ hits, total, page, pageSize }`, hits carry `slug, title,
excerpt, authorName, publishedAt, readTimeMinutes, tags, coverImageUrl`.

`GET /v1/career-advice/{slug}` adds **`body` as raw Markdown** — not HTML. Render it
client-side. Two consequences: there is no server-side syntax highlighting, and
**you must not render it as raw HTML**, because sanitisation now lives on your side.

### 5.9 Reference catalogs

`GET /v1/skills`, `/v1/cities`, `/v1/industries` — all `{ hits, total, page, pageSize }`
with `{ id, slug, name }` (skills also have `category`).

Two modes:
- `?q=go` — type-ahead search.
- `?ids=7,47` — **resolve mode**, and you will need it. `GET /me/profile` returns bare
  `skillIds`, `preferredCityIds` and `industryId` with no names, so the profile screen
  is unrenderable without turning ids into labels.

### 5.10 `DELETE /v1/me/account` *(auth)*

```json
{ "confirm": "DELETE" }
```

Exact, uppercase; anything else is a 400. Returns `{ "deleted": true }`, and the account
and its data are gone immediately — there is no grace period and no undo. Candidate
accounts only. **Both app stores require you to expose this**, so wire it into settings.

---

## 6. Things that will bite you

1. **The `/v1` split in §1.** The single most likely source of 404s.
2. **`mode=on-site`, not `mode=ONSITE`.** Frozen to match published web URLs.
3. **Salaries are paise.** `320000000` is ₹32 LPA.
4. **`logoUrl` is null everywhere today.** Not a bug; no logos have been uploaded.
5. **503 from `/v1/jobs` means the search backend is down**, not "no jobs".
6. **Refresh tokens rotate.** Persist the new one on every refresh or you will log users out.
7. **Applying needs a verified email *and* a CV.** Both are 403s; only the CV ones carry a `code`.
8. **Social sign-in is `POST /v1/auth/mobile/{google,apple}`** with an on-device ID token — never a webview against `/auth/google`.
9. **No push notifications.** No device-token registration exists in any layer.
10. **No client-readable feature flags.** The only flag route is admin-guarded, so the
    app cannot discover what the web can turn off. Note `feature.resume_download_pdf`
    is seeded **off**, so "view my resume" 403s for every user on day one.

## 7. Not built

Push notifications · a candidate notification feed · OpenAPI/Swagger (so no generated
Dart client) · a client-readable flag projection · any hosted environment.

---

*Generated 2026-08-08 from a running instance. Endpoint behaviour is covered by the
API test suite; if an example here disagrees with the code, the code is right and this
file is stale — please report it.*
