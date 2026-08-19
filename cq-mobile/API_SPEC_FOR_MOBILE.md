# CQ Mobile — Backend API Spec (for the JobPortal website developer)

**Prepared for:** the JobPortal web/backend developer
**Prepared by:** CQ mobile app team
**Date:** 2026-08-06
**Repo this targets:** `jobportal` (the existing Next.js web + NestJS API monorepo)
**Repo this does NOT touch:** `cq-mobile` (the Flutter app — separate repo)

---

## 1. Why this document exists

The **CQ / Career Queue** mobile app (Flutter) is a job-seeker client that talks to the **same NestJS backend and the same database** as the JobPortal website. It already works for everything that has an authenticated REST endpoint today:

- Login / register / refresh (cookie auth)
- Profile (`GET /me/profile`) + onboarding writes
- Saved jobs (`/me/saved-jobs`)
- Applications list + withdraw (`/me/applications`)
- Job alerts CRUD (`/me/alerts`)

The **remaining** job-seeker features — **job search, job detail, companies, career advice, and the home feed** — are rendered by the website **server-side (SSR via Prisma + Elasticsearch)** and have **no public REST endpoint**. The mobile app therefore has nothing to read for those screens.

This spec lists exactly the endpoints the backend needs to add so the app reaches **full parity with the website's job-seeker features**. Every endpoint below is a **thin REST wrapper over the exact same query/loader the SSR page already runs** — the notes point at the specific files and functions to reuse so mobile and web stay behaviourally identical. Nothing here asks you to change existing behaviour; the only endpoint that touches an existing route (`/me/applications`) is **purely additive and backward-compatible**.

> **Important:** the CQ mobile team does not commit to the `jobportal` repo. This document is the hand-off — please implement these on the backend and let us know the field names if anything diverges from the shapes below.

---

## 2. Endpoint summary

| # | Method & path | Auth | Powers (app screen) | Notes |
|---|---|---|---|---|
| 1 | `GET /jobs` | Public | Job Search / SRP + Home "latest jobs" | Wraps `searchJobs` (Elasticsearch) |
| 2 | `GET /jobs/:slug` | Public (optional token) | Job Detail | Slug-drift → 308; visibility gate |
| 3 | `GET /companies` | Public | Companies list | Industry filter + sort |
| 4 | `GET /companies/:handle` | Public | Company profile | `<slug>-overview-<id>` handle |
| 5 | `GET /career-advice` | Public | Career Advice list | Published articles only |
| 6 | `GET /career-advice/:slug` | Public | Article detail | Sanitized `bodyHtml` + FAQ |
| 7 | `GET /home` | Public | Home tab | One composite aggregate |
| 8 | `GET /skills` · `GET /cities` · `GET /industries` | Public | Filters + onboarding pickers | Reference catalogs |
| 9 | `GET /me/applications` (additive) | Session | Applications dashboard | Adds `counts` + `statusHistory` |

**Cross-cutting conventions** (all endpoints):
- **The prefix is split, and a new controller must pick a side deliberately.** `main.ts:56` calls
  `app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL })`, so a controller
  gets **no** prefix unless it asks for one. The newer public surface asks:
  `@Controller({ path: 'jobs', version: '1' })` serves `/v1/jobs`. The authenticated `/me/*` routes and
  `auth/*` do not, and stay at the root — `me/saved-jobs`, `alerts/unsubscribe`.
  An earlier version of this document said there was no prefix at all, which was wrong: the app already
  calls both forms, and a route added on the wrong side 404s in a way nothing in CI would notice.
- Public endpoints omit `@UseGuards(JwtAuthGuard)` (mirror `apps/api/src/media/media.controller.ts` / `alerts/unsubscribe.controller.ts`).
- Validate query params with a Zod DTO via `.safeParse()` → `throw new BadRequestException(parsed.error.issues)` on failure (pattern: `apps/api/src/saved-jobs/saved-jobs.controller.ts` + `dto.ts`).
- List endpoints return the `{ hits, total, page, pageSize }` envelope used by `saved-jobs.service.ts`. Money is **paise**, experience is **months/years raw** — the app formats on-device; do not pre-format server-side.

---

## Public Job Search + Filters

Powers the CQ mobile app **Search** screen and the Home **"latest jobs"** feed. This is a thin REST wrapper over the exact same Elasticsearch query the website already runs server-side — reuse `searchJobs`, do not reimplement it.

### GET /jobs

- **Auth**: Public (no auth). Omit `@UseGuards(JwtAuthGuard)`, mirroring `apps/api/src/media/media.controller.ts`. The website page is a public SSR route; no cookie is read for the results themselves (only the per-user *saved* marker is auth-gated, and that is out of scope for this list endpoint).
- **Purpose**: paginated ACTIVE-job search with the full SRP filter set.

**Query params** — these MUST map onto `SearchJobsParams` (`packages/search/src/types.ts`) exactly the way `parseSrpSearchParams` in `apps/web/lib/srp/params.ts` maps the website's URL params. Note the two important transforms the web layer applies before calling `searchJobs`: **experience is entered in YEARS in the URL but multiplied by 12 into months**, and **`emp`/`mode` are accepted but no-op**.

| Param | Type / default | Meaning → `SearchJobsParams` mapping |
|---|---|---|
| `q` | string, optional | Free-text. → `q`. Drives `multi_match` over `title^4, companyName^2, skills^2, shortDescription, description` with `fuzziness: AUTO`. |
| `skill` | string, repeatable (`?skill=react&skill=typescript`) | Skill **slugs**. → `skillSlugs: string[]` (ES `terms` filter on `skillSlugs`). |
| `city` | string, repeatable | City **slugs**. → `citySlugs: string[]` (ES `terms` on `citySlugs`). |
| `industry` | string, optional | Industry **slug** (single). → `industrySlug` (ES `term`). |
| `expMin` | number (years), optional | Min experience in **years**. Web multiplies by 12: → `minExperienceMonths = expMin * 12` (ES `range gte` on `minExperienceMonths`). Only applied when finite and `>= 0`. |
| `expMax` | number (years), optional | Max experience in **years**. → `maxExperienceMonths = expMax * 12` (ES `range lte` on `maxExperienceMonths`). Only when finite and `>= 0`. |
| `salaryMin` | number (paise), optional | → `salaryMin` (ES `range gte` on **`salaryMax`** — i.e. "jobs whose ceiling is at least this"). Only when finite and `>= 0`. |
| `postedWithin` | enum `1` \| `7` \| `30`, optional | → `postedWithinDays` (ES `range gte: now-{n}d/d` on `postedAt`). Any other value is ignored. |
| `sort` | enum `relevance` \| `recent` \| `salary_desc`, default `relevance` | → `sort`. Any other value ignored (falls back to `relevance`). |
| `page` | number, 1-indexed, default `1` | → `page`. Coerced to `floor`, must be `> 0`. `pageSize` is fixed server-side at **20** — not client-settable. |
| `emp` | string, repeatable — **NO-OP** | Employment type. Accepted for URL/round-trip parity but **not mapped** onto `SearchJobsParams` (schema has no column yet — deferred per PR #7). Filtering by it returns unfiltered results. Flag clearly in mobile client / docs. |
| `mode` | string, repeatable — **NO-OP** | Work mode (`ONSITE`/`REMOTE`/`HYBRID`). Same status as `emp`: accepted, **not applied** at the index layer. `workMode` is **not** a field on `JobDoc` and is not rendered on the card. |

**Request body**: none (GET).

**Response** — `{ hits, total, page, pageSize }` (the same envelope `/me/saved-jobs` and `/me/applications` return; `pageSize` is always 20). Each hit contains **only the fields `JobCard` actually renders**, with company logo + city display-name resolved server-side (the ES `JobDoc` carries neither — see notes).

```jsonc
{
  "hits": [
    {
      "id": 12345,                         // number  (JobDoc.id)
      "title": "Senior React Engineer",    // string  (JobDoc.title)
      "canonicalSlug": "senior-react-engineer-acme-12345", // string — build detail URL /job/{canonicalSlug}
      "company": {
        "id": 88,                          // number  (JobDoc.companyId)
        "name": "Acme Corp",               // string  (JobDoc.companyName)
        "slug": "acme",                    // string  (JobDoc.companySlug) — overview URL /company/{slug}-overview-{id}
        "logoUrl": "https://.../logo.png"  // string | null — JOINED from Company.logoUrl (NOT in JobDoc)
      },
      "city": "Bengaluru",                 // string | null — display name JOINED from City.name via primaryCitySlug
      "citySlug": "bengaluru",             // string | null (JobDoc.primaryCitySlug) — optional, for deep-linking filters
      "salaryMin": 2400000,                // number | null — paise (JobDoc.salaryMin)
      "salaryMax": 3600000,                // number | null — paise (JobDoc.salaryMax)
      "minExperienceMonths": 60,           // number | null (JobDoc.minExperienceMonths)
      "maxExperienceMonths": 96,           // number | null (JobDoc.maxExperienceMonths)
      "skills": ["React", "TypeScript"],   // string[] — display names (JobDoc.skills); card shows first 5 + "+N"
      "postedAt": "2026-08-01T09:00:00Z",  // string — ISO 8601 (JobDoc.postedAt)
      "shortDescription": "Build our..."   // string | null (JobDoc.shortDescription) — card shows a 2-line clamp
    }
  ],
  "total": 214,      // number — ES total hit count (track_total_hits: true)
  "page": 1,         // number — echoes request
  "pageSize": 20     // number — fixed
}
```

> Salary and experience are returned as **raw values** (paise / months), matching `JobDoc`. Presentation strings ("₹24–36 LPA", "5–8 yrs", "2w ago") are produced by `formatSalaryLpa` / `formatExperienceMonths` / `postedAgo` in `apps/web/lib/job/format.ts` — the mobile app should format on-device, or the endpoint may optionally add pre-formatted fields, but do not drop the raw numbers.

**Rules & notes**

- **Visibility gate — ACTIVE only.** `searchJobs` (`packages/search/src/queries/searchJobs.ts:32`) always pushes `{ term: { status: status ?? 'ACTIVE' } }` into `bool.filter`. The public endpoint must call `searchJobs` **without** overriding `status`, so drafts/expired/closed never leak. Do not expose the `status` param to mobile clients.
- **Reuse, don't rewrite.** The entire query (filter composition, `multi_match` boosts, sort dispatch, `from/size`, `track_total_hits`) lives in `searchJobs(params: SearchJobsParams)` at `packages/search/src/queries/searchJobs.ts`. The API already depends on `@jobportal/search` (see `apps/api/src/alerts/alerts.processor.ts:4`). The controller's only job is: parse query → build `SearchJobsParams` → `searchJobs()` → hydrate company/city → shape the envelope.
- **Param parsing lives in the web app.** The canonical URL→params mapping (including the `* 12` year→month conversion, the `salaryMin`→`salaryMax` range semantics, and the `emp`/`mode` no-op) is `parseSrpSearchParams` in `apps/web/lib/srp/params.ts`. Port this logic into the NestJS **Zod DTO** verbatim so mobile and web behave identically. Do not diverge.
- **Server-side hydration (the two batched joins).** `JobDoc` stores only `companyId` + `primaryCitySlug` (slugs), never logos or city display names. `SrpShell` (`apps/web/components/srp/SrpShell.tsx:83-94`) resolves both in **two batched Prisma lookups** keyed by the visible hits — no per-card query:
  - `prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id, logoUrl } })` → `logoByCompanyId` → `hit.company.logoUrl`.
  - `prisma.city.findMany({ where: { slug: { in: citySlugs } }, select: { slug, name } })` → `cityNameBySlug` → `hit.city`.
  The endpoint **must** replicate exactly this pair of batched joins after `searchJobs` returns, mapping over `results.hits`. City fallback: web de-slugifies `primaryCitySlug` (`.replaceAll('-', ' ')`) when the lookup misses (`JobCard.tsx:38`).
- **Pagination.** 1-indexed `page`; `pageSize` fixed at **20** (`PAGE_SIZE` in `apps/web/app/(seo-jobs)/jobs/page.tsx:8`, and matches `saved-jobs.service.ts` / `applications.service.ts`). ES offset is `from = (page-1)*20`. Total pages = `ceil(total / 20)`. Return the `{ hits, total, page, pageSize }` envelope — identical to `SavedJobListPage` / the applications list.
- **Sorting** (from `searchJobs`): `recent` → `postedAt desc`; `salary_desc` → `salaryMax desc, _score`; `relevance` (default) → `_score, postedAt desc` when `q` is present, else `postedAt desc`. So a filter-only query with no `q` is effectively newest-first — which is exactly what the Home "latest jobs" feed wants (call `GET /jobs?sort=recent` or just `GET /jobs`).
- **Conventions to match**: NestJS `@Controller('jobs')` with a single `@Get()`; validate the query with a Zod DTO via `.safeParse()` throwing `BadRequestException(parsed.error.issues)` on failure (pattern from `apps/api/src/saved-jobs/saved-jobs.controller.ts:27-30` + `apps/api/src/saved-jobs/dto.ts`); no guard (public). Repeated params (`skill`, `city`, `emp`, `mode`) arrive as arrays — coerce single values to arrays in the DTO exactly as `asArray` does in `params.ts`.
- **`emp` / `mode` are no-ops today** — do not silently imply they filter. If the mobile app renders these facets, either hide them until the schema/index gains the columns, or clearly label them non-functional. They only affect the ES query once `SearchJobsParams` grows `employmentType` / `workMode` support.


---

## Public Job Detail

### GET /jobs/:slug

Powers the mobile **Job Detail** screen. Mirrors the SSR page at `apps/web/app/job/[slug]/page.tsx`.

- **Auth**: Public (no auth). The endpoint is anonymously readable, but it **optionally** honors a session token (cookie `access_token` or `Authorization: Bearer …`) so a job's owner, its collaborators, or an admin can preview a not-yet-public job. No token → treated as anonymous.
- **Path param**: `slug` — the full permalink slug, e.g. `sales-executive-acme-12345`. The trailing numeric id is the permalink; the descriptive prefix may drift. Parse with `parseJobSlug()` to extract the id, then load the job **by id** (not by string), exactly as the SSR page does — this is what makes stale slugs resolve and then 308-redirect.
- **Query params**: none.
- **Request body**: none.

**Response `200` (single object, no pagination — this is a detail resource):**

```jsonc
{
  "id": 12345,                          // number — Job.id
  "canonicalSlug": "sales-executive-acme-12345", // string — Job.canonicalSlug (unique)
  "title": "Sales Executive",           // string
  "description": "Plain-text JD…",      // string — always present (legacy fallback render)
  "descriptionMarkdown": "## About…",   // string | null — rich JD; render this if non-null, else `description`
  "shortDescription": "One-liner…",     // string | null — used for meta/summary only, not the visible body
  "status": "ACTIVE",                   // enum JobStatus: ACTIVE | EXPIRED | CLOSED (DRAFT/PENDING_MODERATION only visible to owner/admin/collaborator)
  "employmentType": "FULL_TIME",        // enum EmploymentType: FULL_TIME | PART_TIME | CONTRACTOR | INTERN
  "workMode": "ONSITE",                 // enum WorkMode: ONSITE | REMOTE | HYBRID
  "postedAt": "2026-07-01T09:00:00.000Z", // string (ISO) — Job.postedAt
  "expiresAt": "2026-09-01T00:00:00.000Z", // string (ISO) | null — Job.expiresAt (JSON-LD validThrough)
  "salaryMinPaise": 1800000,            // number | null — raw paise (client formats; see formatSalaryLpa)
  "salaryMaxPaise": 3200000,            // number | null — raw paise
  "experienceMinYears": 2,              // number | null — raw years
  "experienceMaxYears": 5,              // number | null — raw years
  "cities": ["Bangalore", "Pune"],      // string[] — resolved city names (see resolution rule below)
  "skills": [                           // array — resolved from Job.skillIds; badges render `name`
    { "id": 42, "slug": "salesforce", "name": "Salesforce" }
  ],
  "company": {
    "id": 88,                           // number — Job.companyId
    "name": "Acme Corp",                // string
    "slug": "acme-corp",                // string — deep link is `/company/{slug}-overview-{id}`
    "logoUrl": "https://…/logo.png",    // string | null
    "websiteUrl": "https://acme.com"    // string | null — the `companyWebsiteUrl` the About-company card links
  },
  "industry": { "slug": "it-services", "name": "IT Services" } // { slug, name } | null
}
```

**Redirect behavior (`308`):** if the requested `slug` !== `job.canonicalSlug`, respond `308 Permanent Redirect` with `Location: /jobs/{job.canonicalSlug}` — mirrors `permanentRedirect()` in the SSR page (SRS §6.1 slug-drift). **The visibility check MUST run before the redirect is issued**, because the `Location` header carries the real title-bearing slug and would otherwise disclose the title of an unapproved job to an anonymous caller who guessed the id.

**Response `404`:** slug fails `parseJobSlug` (no trailing id / malformed), no job with that id, OR the job is `DRAFT`/`PENDING_MODERATION` and the viewer is not owner/collaborator/admin. The 404 for an unauthorized unpublished job must be byte-identical to the 404 for a non-existent id — it must not confirm the posting exists.

**Rules & notes**

- **Visibility gate** — reuse the logic in `apps/web/lib/job/visibility.ts` (port to the API or a shared package; no equivalent exists in `apps/api` yet):
  - `isPubliclyReadable(status)` → `PUBLICLY_READABLE = ['ACTIVE','EXPIRED','CLOSED']`. `EXPIRED`/`CLOSED` stay readable (render the closed notice + disabled apply); they are `noindex` on web.
  - `DRAFT` / `PENDING_MODERATION` → **404 for everyone except**: `canPreviewUnpublishedJob(user, job)` (admin `role === 'ADMIN'`, or `job.postedById === user.sub`) OR `isJobCollaborator(user.sub, job.id)` (indexed lookup on `JobCollaborator` via `jobId_userId`). Full decision in cost order = `canViewJob(user, job)`.
  - Caution: a `DRAFT` still carries a non-null `postedAt` (NOT NULL DEFAULT now()), so never treat `postedAt` as proof a job was ever public — gate on `status` only.
- **Slug parsing / permalink** — `parseJobSlug()` and `buildJobSlug()` in `apps/web/lib/url/slug.ts`. Regex `^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)$`; id must be a finite positive int. Load by id, then reconcile the slug.
- **Data load** — replicate the `loadJob(id)` include in `apps/web/app/job/[slug]/page.tsx`: `job.findUnique({ where: { id }, include: { company: select name/slug/logoUrl/websiteUrl, primaryCity: select name, industry: select slug/name } })`.
- **Skills resolution** — same page: `prisma.skill.findMany({ where: { id: { in: job.skillIds } }, select: { id, slug, name } })`; empty `skillIds` → `[]`. Badges render `name`; `slug` is what the related-roles rail keys on.
- **Cities resolution** — same page: `prisma.city.findMany({ where: { id: { in: job.cityIds } }, select: { id, name } })` → names; **fallback** to `[primaryCity.name]` when `cityIds` is empty; empty both → `[]`. (Web joins these to a single `location` string for display; the API returns the array and lets the client join.)
- **Salary / experience are returned RAW** (`*Paise`, `*Years`) — display formatting (`formatSalaryLpa`, `formatExperienceYears`, `EMPLOYMENT_LABELS`, `WORK_MODE_LABELS`) lives in `apps/web/lib/job/format.ts`; the Flutter client formats, so do not pre-format server-side.
- **Out of scope for this payload**: the `JobPosting` JSON-LD (built by `jobPosting()` in `apps/web/lib/seo/json-ld.ts`) is derived from these same fields — don't add SEO/JSON-LD or apply-quota fields to the REST response.
- **Conventions** — implement as a NestJS `@Controller('jobs')` with a public `@Get(':slug')` (no `@UseGuards(JwtAuthGuard)`), validating any future query with a Zod DTO via `safeParse` per `apps/api/src/saved-jobs/{dto,controller}.ts`. For the optional-auth preview, reuse `readAccessTokenCookie` + `verifyAccessToken` from `apps/api/src/auth/jwt-auth.guard.ts` in a non-throwing (optional) variant — the existing `JwtAuthGuard` throws on a missing token, which is wrong for a public endpoint.
- **Pagination** — N/A here (single resource). The `{ hits, total, page, pageSize }` shape (pageSize 20) from `me/saved-jobs` / `me/applications` applies only to the list endpoints, not this detail route.


---

## Companies directory + profile

Two public, read-only endpoints that mirror what the website renders server-side today. Both are **Public (no auth)** — the SSR pages (`apps/web/app/companies/page.tsx`, `apps/web/app/company/[handle]/page.tsx`) run no auth gate on the company data itself (the only auth is the shared header chrome, which the mobile app does not need). There is **no `Company.status`/visibility column** — every `Company` row is public. Job-derived data is gated to `status: 'ACTIVE'` only.

Implement as a NestJS controller (e.g. `apps/api/src/companies/companies.controller.ts`, no `@UseGuards`), Zod DTO validation via `.safeParse` → `BadRequestException(parsed.error.issues)` (copy the pattern in `apps/api/src/saved-jobs/saved-jobs.controller.ts`), and the `{ hits, total, page, pageSize }` page shape from `apps/api/src/saved-jobs/saved-jobs.service.ts`.

---

### GET /companies

Paginated company directory. **Powers the app Companies list.**

- **Auth**: Public (no auth)
- **Query params** — match `parseDirectoryParams()` in `apps/web/lib/companies/params.ts` exactly:
  - `category` — string (industry **slug**, lowercase), default none — filters to one industry. Validated against `^[a-z0-9]+(?:-[a-z0-9]+)*$`; resolved to `industryId` via `prisma.industry.findUnique({ where: { slug } })`. **An unknown/malformed slug is silently ignored (no filter), not a 404** — this is how the SSR behaves (`filterIndustry` falls back to `null`).
  - `sort` — enum `rating | name | reviews`, default `rating` — ordering (see Rules).
  - `hiring` — boolean, default `false` — when `1`/`true`, restrict to companies with ≥1 ACTIVE job (`where.jobs = { some: { status: 'ACTIVE' } }`).
  - `page` — integer ≥ 1, default `1` — 1-indexed.
  - ⚠️ **`?q=` free-text search does NOT exist in the SSR.** The website filters by industry `category` only — do not invent a text search. If the mobile app truly needs one, flag it as net-new scope (e.g. `name` case-insensitive `contains`), not parity.
- **Response** (`200`):

```jsonc
{
  "hits": [
    {
      "id": 13832,                       // number  (Company.id)
      "name": "Infosys",                 // string  (Company.name)
      "slug": "infosys",                 // string  (Company.slug, unique)
      "handle": "infosys-overview-13832",// string  DERIVED = `${slug}-overview-${id}` (the /companies/:handle key; matches CompanyCard href)
      "logoUrl": "https://.../infosys.png", // string | null  (Company.logoUrl)
      "industryName": "IT Services",     // string | null  (Company.industry.name)
      "hqCityName": "Bengaluru",         // string | null  (Company.headquartersCity.name)
      "averageRating": 4.1,              // number | null  (Company.averageRating)
      "reviewCount": 2840,               // number         (Company.reviewCount, default 0)
      "openRolesCount": 37               // number         (count of jobs where status='ACTIVE')
    }
  ],
  "total": 512,      // number  total companies matching where-clause (prisma.company.count)
  "page": 1,         // number
  "pageSize": 20     // number  (see pagination note)
}
```

---

### GET /companies/:handle

Single company profile. `:handle` is the canonical form `<slug>-overview-<id>` (e.g. `tata-consultancy-services-overview-2114`). **Powers the app Company detail.**

- **Auth**: Public (no auth)
- **Path param**: `handle` — parse with `parseCompanySlug()` from `apps/web/lib/url/slug.ts` (regex `^([a-z0-9]+(?:-[a-z0-9]+)*)-overview-(\d+)$`). The **numeric id is the permalink**; the slug can drift.
  - Malformed handle or missing company → `404`.
  - **Slug drift**: if `parsed.slug !== company.slug`, return `308` redirect to `/companies/<company.slug>-overview-<id>` (mirrors the SSR `permanentRedirect`). If a redirect is awkward for the mobile client, at minimum return the canonical `handle` in the body so the app can self-correct.
- **Response** (`200`):

```jsonc
{
  "id": 2114,                         // number
  "name": "Tata Consultancy Services",// string
  "slug": "tata-consultancy-services",// string
  "handle": "tata-consultancy-services-overview-2114", // string DERIVED canonical
  "logoUrl": "https://.../tcs.png",   // string | null
  "description": "TCS is ...",         // string | null   (about — render split on blank lines client-side)
  "websiteUrl": "https://www.tcs.com",// string | null
  "companyType": "INDIAN_MNC",        // CompanyType enum | null (label via companyTypeLabel(), company-format.ts)
  "industryName": "IT Services",      // string | null   (industry.name)
  "hqCityName": "Mumbai",             // string | null   (headquartersCity.name)
  "employeeCount": "100000+",         // string | null   (Company.employeeCount — free-text size band)
  "foundedYear": 1968,                // number | null
  "averageRating": 3.9,               // number | null   } rating summary
  "reviewCount": 15230,               // number          } (denormalised on Company row)
  "activeJobs": 214,                  // number  count of jobs where status='ACTIVE'
  "isVerified": true,                 // boolean  = (kyc.status === 'VERIFIED')
  "highlights": [                     // "What it's like to work here" — parseHighlightSections(Company.workingAtSections)
    { "heading": "Culture", "body": "...", "imageUrl": "https://..." } // imageUrl optional; malformed blocks dropped
  ],
  "openings": [                       // top 10 ACTIVE jobs, postedAt desc (CompanyOpenings.tsx)
    {
      "id": 90210,                    // number  (Job.id)
      "title": "Senior Backend Engineer", // string
      "canonicalSlug": "senior-backend-engineer-tcs-90210", // string (Job.canonicalSlug → app builds /job/<slug>)
      "primaryCityName": "Pune",      // string | null  (Job.primaryCity.name)
      "postedAt": "2026-08-01T09:00:00.000Z" // ISO date (Job.postedAt)
    }
  ],
  "reviews": [                        // top 5, createdAt desc (CompanyReviews.tsx)
    {
      "id": 5501,                     // number
      "rating": 4,                    // number (1-5)
      "title": "Great learning",      // string | null
      "body": "...",                  // string
      "isVerified": false,            // boolean
      "createdAt": "2026-07-20T...",  // ISO date
      "authorName": "Anil K"          // string | null  (CompanyReview.user.name; null → render "Anonymous")
    }
  ],
  "relatedCompanies": [               // same-industry peers, ≤5 (loadRelatedCompanies)
    {
      "id": 3001, "slug": "wipro", "name": "Wipro",
      "logoUrl": "https://...",       // string | null
      "averageRating": 3.7,           // number | null
      "openRoles": 88                 // number (ACTIVE job count)
    }
  ]
}
```

---

**Rules & notes**

- **Visibility gates**: No company-level gate — every `Company` row is public (there is no status/published column; confirmed in `packages/db/prisma/schema.prisma model Company`). Only job-derived data is filtered to `status: 'ACTIVE'` (`openRolesCount`, `activeJobs`, `openings`, related `openRoles`). `isVerified` is strictly `company.kyc?.status === 'VERIFIED'` (enum `KycStatus`: NOT_SUBMITTED/PENDING/VERIFIED/REJECTED); absent KYC row → `false`.
- **List sort** — reuse the exact `orderBy` ladder in `apps/web/app/companies/page.tsx` (lines ~50-55), every branch ending in an `id` tiebreaker for deterministic offset pagination:
  - `rating` (default): `[{ averageRating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }]`
  - `name`: `[{ name: 'asc' }, { id: 'asc' }]`
  - `reviews`: `[{ reviewCount: 'desc' }, { name: 'asc' }, { id: 'asc' }]`
- **`openRolesCount` (list)** — do NOT N+1. The SSR runs one grouped query over the visible page ids: `prisma.job.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, status: 'ACTIVE' }, _count: { _all: true } })` (`apps/web/app/companies/page.tsx` ~85-94). Reuse verbatim.
- **`category` filter** — resolve slug → industry first; an unresolved slug yields no filter (not an error), matching SSR.
- **Profile queries** already exist and should be reused, not rewritten:
  - Core company select: `loadCompany(id)` in `apps/web/app/company/[handle]/page.tsx` (~36-58).
  - Related peers + their ACTIVE counts: `loadRelatedCompanies(companyId, industryId)` — same file (~63-91): `where: { industryId, id: { not: companyId } }`, `orderBy: [{ reviewCount: 'desc' }, { averageRating: 'desc' }, { id: 'asc' }]`, `take: 5`; returns `[]` when `industryId` is null.
  - Openings: `CompanyOpenings` in `apps/web/components/companies/CompanyOpenings.tsx` — `take: 10`, `orderBy: { postedAt: 'desc' }`, `status: 'ACTIVE'`; plus a separate `activeJobs` count (`prisma.job.count`).
  - Reviews: `CompanyReviews` in `apps/web/components/companies/CompanyReviews.tsx` — `take: 5`, `orderBy: { createdAt: 'desc' }`.
  - `highlights`: `parseHighlightSections(Company.workingAtSections)` in `apps/web/components/companies/CompanyHighlights.tsx` (narrows loose JSON to `{ heading, body, imageUrl? }[]`, drops malformed blocks).
  - `companyType` label + website host: `companyTypeLabel()` / `hostOf()` in `apps/web/components/companies/company-format.ts` (return the raw enum + url in JSON; let the app format, or include both).
- **Slug parsing/building**: `parseCompanySlug()` / `buildCompanySlug()` in `apps/web/lib/url/slug.ts` — reuse for the `:handle` route and to emit the canonical `handle`. These live in `apps/web`; the backend dev should lift them into a shared package (e.g. `@jobportal/types` or a small util in `@jobportal/db`) rather than duplicate the regex.
- **Pagination shape**: return `{ hits, total, page, pageSize }` per `apps/api/src/saved-jobs/saved-jobs.service.ts`. ⚠️ **pageSize divergence**: the mobile REST convention is `pageSize: 20` (saved-jobs/applications), but the web SSR directory uses `PAGE_SIZE = 24` (`apps/web/app/companies/page.tsx` line 16) to fit its 2-col grid. Recommend the API standardize on **20** to match the other list endpoints; do not silently inherit 24. Over-range `page` (> `ceil(total/pageSize)`) — the SSR redirects to the last page; a REST endpoint should instead return an empty `hits` array with the real `total` (let the client clamp), which is simpler and cache-friendly.
- **DTO**: e.g. `ListCompaniesQueryDto = z.object({ category: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), sort: z.enum(['rating','name','reviews']).optional(), hiring: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).optional() })` — mirrors `apps/api/src/saved-jobs/dto.ts` (`z.coerce.number().int().min(1).optional()` for `page`).

---

## Career Advice / Articles

Powers the mobile app's **Career Advice list** and **Article** screens. Backed by the `Article` model (`packages/db/prisma/schema.prisma` lines 1221–1246). Both endpoints are read-only and expose **`status = 'PUBLISHED'` articles only** — the exact gate the SSR pages already enforce. Implement as a new public NestJS controller (e.g. `apps/api/src/career-advice/`), Zod-validated, reusing the same Prisma `where`/`select`/`orderBy` the web pages use.

---

### GET /career-advice

Paginated, filterable list of published articles. Mirrors `apps/web/app/career-advice/page.tsx` (`CareerAdviceIndexPage`).

- **Auth**: Public (no auth)
- **Query params** (parse with a Zod DTO that reproduces `parseArticleIndexParams` in `apps/web/lib/cms/params.ts` exactly):
  - `tag` — string, default `null` — tag slug filter. **Only applied if it matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`** (lowercase, hyphen-separated); otherwise ignored/treated as no filter. Maps to `where.tags = { has: tag }`.
  - `q` — string, default `null` — free-text search. **Trimmed, then truncated to 80 chars** (`MAX_Q`). When non-empty, maps to `where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }]`.
  - `page` — integer, default `1` — 1-indexed. `Number(page)` must be finite and `>= 1`, then `Math.floor`; anything else falls back to `1`.
- **Request body**: none.
- **Response** (`{hits,total,page,pageSize}` shape, same as `/me/saved-jobs`):

```jsonc
{
  "hits": [
    {
      "slug": "how-to-negotiate-salary",   // string — canonical identifier / URL key (@unique)
      "title": "How to negotiate salary",   // string
      "excerpt": "A calm, structured...",   // string | null
      "authorName": "Asha Rao",             // string (plain name, no author object/photo)
      "publishedAt": "2026-07-14T09:00:00.000Z", // string (ISO 8601) | null
      "readTimeMinutes": 6,                 // number | null
      "tags": ["salary", "early-career"],   // string[]
      "coverImageUrl": "https://.../x.jpg"  // string | null
    }
  ],
  "total": 37,        // number — count of PUBLISHED matching the same where
  "page": 1,          // number (echoed, normalized)
  "pageSize": 12      // number — see pagination note below
}
```

---

### GET /career-advice/:slug

Single published article with rendered body + FAQ. Mirrors `loadArticle` + `ArticleDetailPage` in `apps/web/app/career-advice/[slug]/page.tsx`.

- **Auth**: Public (no auth)
- **Path param**: `slug` — string (validate against the same slug regex).
- **Request body**: none.
- **Behavior**: `prisma.article.findUnique({ where: { slug } })`; return **404** if not found **or** `status !== 'PUBLISHED'` (drafts/archived are invisible to anonymous callers — identical to the page's `notFound()`).
- **Response**:

```jsonc
{
  "id": 42,                                 // number (Int @id)
  "slug": "how-to-negotiate-salary",        // string
  "title": "How to negotiate salary",       // string
  "bodyHtml": "<h2>...</h2><p>...</p>",      // string — sanitized HTML, see note
  "excerpt": "A calm, structured...",       // string | null
  "authorName": "Asha Rao",                 // string
  "publishedAt": "2026-07-14T09:00:00.000Z",// string (ISO 8601) | null
  "readTimeMinutes": 6,                     // number | null
  "tags": ["salary", "early-career"],       // string[]
  "faqs": [                                 // array | null — Json column; each { question, answer }
    { "question": "...", "answer": "..." }
  ],
  "coverImageUrl": "https://.../x.jpg",     // string | null
  "updatedAt": "2026-07-20T12:00:00.000Z"   // string (ISO 8601)
}
```

---

### Rules & notes

- **Visibility gate (both endpoints)**: always constrain `status: 'PUBLISHED'`. List: `where.status = 'PUBLISHED'` (page.tsx L49). Detail: after `findUnique`, reject unless `a.status === 'PUBLISHED'` (page L92, L74). Never expose `DRAFT`/archived.
- **Filter logic lives in** `apps/web/lib/cms/params.ts` → `parseArticleIndexParams()`. Port it verbatim into the Zod DTO so the `tag`/`q`/`page` normalization (slug regex, trim + 80-char cap, page floor) stays byte-identical. Do not re-derive it.
- **List projection**: reuse `ARTICLE_SELECT` (page.tsx L34–43) — `slug, title, excerpt, authorName, publishedAt, readTimeMinutes, tags, coverImageUrl`. ⚠️ The SSR list does **not** select `id`; `slug` is the stable key the app should use (it is `@unique`). Add `id` only if the app needs it — trivial, but it is not part of what the website currently renders.
- **`author` = `authorName`** (a plain `String` on `Article`). There is no author object, id, or photo in the data model (`article-format.ts` derives initials from the string only).
- **Sorting**: `orderBy: { publishedAt: 'desc' }` (newest first) — page.tsx L61. Detail page has no sort.
- **Pagination**: the career-advice SSR page uses **`PAGE_SIZE = 12`** (page.tsx L17), *not* the `20` used by `/me/saved-jobs` and `/me/applications`. To match the SSR feed exactly, keep `pageSize: 12`; if consistency with the other mobile list endpoints is preferred, set 20 — **flag this as an explicit decision** rather than silently picking one. `total` comes from `prisma.article.count({ where })` with the same `where` (page.tsx L66); the client derives `totalPages = ceil(total / pageSize)`.
- **Rendered body**: the website converts `Article.body` (Markdown source) to sanitized HTML server-side via `renderArticleMarkdown()` in `apps/web/lib/cms/markdown.ts` (unified + remark-gfm + remark-rehype + Shiki + `rehype-sanitize`, which strips `<script>`/`<style>`/raw HTML and `javascript:`/`data:` URLs). Return this as `bodyHtml` so the Flutter app renders the same safe HTML instead of re-implementing the pipeline. That helper currently lives under `apps/web`; move/share it (e.g. into a package) or replicate the exact processor config so sanitization is not weakened. If the app would rather render Markdown itself, return raw `body` instead — but do **not** ship unsanitized HTML.
- **FAQs**: `faqs` is a nullable `Json` column. The page validates it with `isFaqArray` (page L27–38) — an array of objects each having string `question` and `answer`; anything else is treated as `[]`. Apply the same guard before serializing.
- **Dates**: Prisma returns `Date`; serialize as ISO 8601 strings. `publishedAt` is nullable (`DateTime?`); `updatedAt` is always present.
- **Not in scope but rendered by the site** (optional future endpoints): the list page also computes a **tag facet list with counts** (`topics`, page.tsx L76–80) for the masthead, and the detail page renders **related articles** (`apps/web/components/career-advice/RelatedArticles.tsx` — `tags: { hasSome }` then newest-published filler). Mention only if the app needs the topic chips or a "Keep reading" rail.
- **Conventions to match**: controller shape like `apps/api/src/saved-jobs/saved-jobs.controller.ts` (thin controller, `DTO.safeParse(query)` → `BadRequestException(parsed.error.issues)` on failure), Zod DTO like `apps/api/src/saved-jobs/dto.ts`, and the `{ hits, total, page, pageSize }` return type like `SavedJobListPage` in `saved-jobs.service.ts`. Omit `@UseGuards(JwtAuthGuard)` since these are public.


---

## Home Feed (Mobile Home Tab)

A single read-only aggregate that returns everything the website's marketing homepage renders server-side, in one round trip. It mirrors the web SSR loader exactly — same queries, same limits, same field names — so the Flutter Home tab shows identical inventory.

### GET /home

- **Auth**: Public (no auth). The web homepage is public + edge-cached (`revalidate = 1800`, i.e. 30 min). The endpoint must expose the same marketing data to logged-out clients and crawlers. Do NOT port the `if (user?.role === 'CANDIDATE') redirect('/profile')` behaviour from `apps/web/app/page.tsx` — that is a web-only UX redirect, not a data gate; the mobile app decides its own routing.
- **Query params**: none. Every section is a fixed-size slice (no paging, no filters, no sort input).
- **Request body**: none.
- **Response** (single composite object; each section is a fixed-length array):

```jsonc
{
  "counts": {
    "activeJobs": 1284,   // int  — prisma.job.count({ where: { status: 'ACTIVE' } })
    "companies": 342,     // int  — prisma.company.count()  (ALL companies, no status filter)
    "hiringTeams": 87     // int  — prisma.user.count({ where: { role: 'RECRUITER' } })
                          //        NOTE: source field is counts.recruiters; the Hero labels it "hiring teams".
                          //        Expose it as hiringTeams for the app, or keep `recruiters` — pick one and document it.
  },

  // source key: latestJobs — newest 8 ACTIVE jobs, ordered postedAt desc (uses @@index([status, postedAt]))
  "featuredJobs": [
    {
      "canonicalSlug": "senior-backend-engineer-acme-12345", // string  (deep link: /job/{canonicalSlug})
      "title": "Senior Backend Engineer",                    // string
      "companyId": 42,                                       // int
      "companyName": "Acme Corp",                            // string
      "companyLogoUrl": "https://cdn/…/logo.png",            // string | null
      "cityName": "Bangalore",                               // string | null  (Job.primaryCity.name)
      "salaryMinPaise": 2500000000,                          // int | null  (PAISE; ÷100 = INR — format to LPA client-side)
      "salaryMaxPaise": 4000000000,                          // int | null
      "workMode": "REMOTE",                                  // string enum: ONSITE | HYBRID | REMOTE (raw; label via WORK_MODE_LABELS)
      "postedAt": "2026-08-05T09:12:00.000Z"                 // ISO 8601 (Prisma Date → JSON string)
    }
  ],

  // source key: featuredCompanies — top 8 by averageRating desc (nulls last), then name asc
  "featuredCompanies": [
    {
      "id": 42,                     // int   (deep link: /company/{slug}-overview-{id})
      "slug": "acme-corp",          // string
      "name": "Acme Corp",          // string
      "logoUrl": null,              // string | null
      "industryName": "Software",   // string | null  (Company.industry.name)
      "hqCityName": "Bangalore",    // string | null  (Company.headquartersCity.name)
      "averageRating": 4.3,         // number | null
      "reviewCount": 128,           // int
      "openingsCount": 12           // int   — count of ACTIVE jobs at this company
    }
  ],

  // source key: topRoles — curated title-keyword buckets, zero-count dropped, top 10 by count desc
  "roles": [
    { "label": "Backend Engineer", "query": "backend", "jobCount": 34 }
    // label: string, query: string (feeds SRP ?q=), jobCount: int
  ],

  // source key: popularCities — top 12 city groups by ACTIVE-job count on primaryCityId
  "cities": [
    { "slug": "bangalore", "name": "Bangalore", "jobCount": 312 }
    // slug: string (feeds SRP ?city=), name: string, jobCount: int
  ],

  // source key: topIndustries — top 12 industry groups by ACTIVE-job count
  "industries": [
    { "slug": "software", "name": "Software", "jobCount": 540 }
    // slug: string (feeds SRP ?industry=), name: string, jobCount: int
  ],

  // source key: popularSkills — top 12 skills by ACTIVE-job count via UNNEST(skillIds)
  "topSkills": [
    { "slug": "react", "name": "React", "jobCount": 210 }
    // slug: string (feeds SRP ?skill=), name: string, jobCount: int
  ],

  // source key: recentArticles — newest 3 PUBLISHED articles, ordered publishedAt desc
  "recentArticles": [
    {
      "slug": "how-to-write-a-resume",         // string  (deep link: /career-advice/{slug})
      "title": "How to write a resume",        // string
      "excerpt": "A practical, no-fluff guide…", // string | null
      "authorName": "Jane Doe",                // string
      "publishedAt": "2026-07-30T00:00:00.000Z", // ISO 8601 | null
      "readTimeMinutes": 6,                    // int | null
      "tags": ["resumes"],                     // string[]  (first tag is the display category)
      "coverImageUrl": null                    // string | null
    }
  ]
}
```

**Rules & notes**

- **Reuse the existing loader — do not rewrite the queries.** All aggregation logic already lives in `loadHomePageData` at `apps/web/lib/home/queries.ts`. It depends only on `prisma`/`Prisma` from `@jobportal/db` (plus `cache` from `react`). Port it into the API — ideally lift it into a shared `@jobportal/db` query module (or a `HomeService`) so web SSR and the mobile endpoint call one implementation. When porting, **drop the `import { cache } from 'react'` wrapper** (it is React request-scoped and inert in Nest) — replace with a Redis TTL cache if caching is wanted.
- **Visibility gates (match exactly):**
  - Jobs everywhere are `status: 'ACTIVE'` only (`counts.activeJobs`, `featuredJobs`/`latestJobs`, `roles`, `cities`, `industries`, `topSkills`, and each company's `openingsCount`).
  - Articles are `status: 'PUBLISHED'` only (`recentArticles`).
  - `counts.companies` is a total `company.count()` with **no** status/active filter (matches the Hero ribbon).
- **Fixed section sizes (from the loader, not paginated):** `featuredJobs` 8 (`take: 8`, `postedAt` desc), `featuredCompanies` 8 (`averageRating` desc nulls-last then `name` asc), `cities`/`industries`/`topSkills` 12 each (job-count desc), `roles` up to 10 (zero-count buckets dropped, then sliced), `recentArticles` 3 (`publishedAt` desc).
- **Roles are a keyword taxonomy, not a table.** `ROLE_DEFS` + `roleCountsQuery()` in `queries.ts` build one `UNION ALL` of `title ILIKE` buckets; `query` is the SRP `?q=` value, not a slug. Keep the labels/queries in TS.
- **Two raw-SQL spots must be carried over verbatim** (see the file's header comment for why): top skills uses `UNNEST("skillIds")` (Prisma `groupBy` on an array column groups by the whole array — wrong), and top cities groups by `primaryCityId` (not the `cityIds[]` array) to match the SRP `/jobs-in-{city}` filter and middleware canonicalisation.
- **Hydration:** `hydratePopularItems()` (exported, unit-tested) maps `{id,jobCount}` groups → `{slug,name,jobCount}` and silently drops ids that no longer hydrate. Reuse it as-is; do not re-query.
- **Field formatting is the client's job** — the API returns raw values, exactly as the loader does. Salaries are **paise** (`formatSalaryLpa`), `workMode` is the raw enum (`WORK_MODE_LABELS`), and relative posting age is derived (`postedAgo`) — all three helpers live at `apps/web/lib/job/format.ts` for reference; the Flutter side reimplements them.
- **Serialization:** `postedAt` and `publishedAt` are Prisma `Date`s → NestJS emits ISO 8601 strings by default. No transform needed.
- **NestJS conventions:** `@Controller('home')` with a single `@Get()` handler, **no `@UseGuards(JwtAuthGuard)`** (public). There are no inputs, so no Zod DTO is required; if any query param is added later, follow the `Query() query: unknown` → `Dto.safeParse(query)` → `BadRequestException(parsed.error.issues)` pattern used in `apps/api/src/saved-jobs/saved-jobs.controller.ts`.
- **Pagination shape does NOT apply here.** `/home` is a single composite object with fixed-size sections, unlike the list endpoints (`/me/saved-jobs`, `/me/applications`) that return `{ hits, total, page, pageSize }` with `pageSize` 20. Do not force this response into that envelope.
- **Caching:** the web page uses `revalidate = 1800`. Set an equivalent `Cache-Control` (e.g. `s-maxage=1800, stale-while-revalidate`) or a 30-min Redis cache on the endpoint so crawlers/cold app-opens don't hammer the 10-query aggregate.

**Composition trade-off (brief):** the app could instead build the Home tab from the granular endpoints — recent jobs from `GET /jobs?sort=recent&pageSize=8`, featured companies/articles/taxonomy from their own routes — which reuses list caching. The single `GET /home` wins on the app's cold-start path: it collapses ~10 queries into one request (the loader already `Promise.all`s them), matching the SSR round-trip and cutting mobile latency/battery. Recommend `GET /home` for the Home tab specifically, and the granular list endpoints for the dedicated Jobs/Companies/Articles tabs.


---

## Reference catalogs

Three public, read-only lookup endpoints that expose the `Skill`, `City`, and `Industry` seed tables. They power the mobile app's search filters and the onboarding **industry / current-city / preferred-city / skills** pickers. All three are pure reference data already rendered publicly by the website (SEO landing pages, sitemap, onboarding wizard), so there is no per-user or visibility state to protect — they are unauthenticated.

Routes live at the API root (no global prefix — `apps/api/src/main.ts` sets none), exactly like `me/saved-jobs` and `alerts/unsubscribe`.

---

### GET /skills

- **Auth**: Public (no auth) — controller omits `@UseGuards(JwtAuthGuard)`, mirroring `apps/api/src/alerts/unsubscribe.controller.ts`.
- **Query params**:
  - `q` — string, optional, default none — case-insensitive substring match on `Skill.name` (`{ name: { contains: q, mode: 'insensitive' } }`). Trimmed; empty/absent ⇒ no filter, returns the first page of the full catalogue.
  - `page` — int ≥ 1, default `1` — 1-indexed offset page (same semantics as `ListSavedJobsQueryDto`).
  - `pageSize` — int 1–100, default `20` — result cap. A picker pulls the whole small catalogue with `?pageSize=100`; skills (the largest table) stays bounded.
- **Request body**: none.
- **Response** (`200`) — `{hits,total,page,pageSize}` envelope, identical shape to `SavedJobsService.list`:

```jsonc
{
  "hits": [
    { "id": 42, "name": "React",   "slug": "react",   "category": "Frontend" }, // id:int, name:string, slug:string, category:string|null
    { "id": 87, "name": "Node.js", "slug": "node-js", "category": null }
  ],
  "total": 128,      // int — count of the full q-filtered set
  "page": 1,         // int
  "pageSize": 20     // int
}
```

---

### GET /cities

- **Auth**: Public (no auth).
- **Query params**: `q` (string, optional) — case-insensitive `contains` on `City.name`; `page` (int ≥ 1, default `1`); `pageSize` (int 1–100, default `20`).
- **Request body**: none.
- **Response** (`200`):

```jsonc
{
  "hits": [
    { "id": 5, "name": "Bengaluru", "slug": "bengaluru", "state": "Karnataka" }, // id:int, name:string, slug:string, state:string
    { "id": 9, "name": "Pune",      "slug": "pune",      "state": "Maharashtra" }
  ],
  "total": 74,
  "page": 1,
  "pageSize": 20
}
```

> `City` also has a `country` column (defaults `"India"`); the pickers don't render it, so it is intentionally omitted. Add it only if the app later needs it.

---

### GET /industries

- **Auth**: Public (no auth).
- **Query params**: `q` (string, optional) — case-insensitive `contains` on `Industry.name`; `page` (int ≥ 1, default `1`); `pageSize` (int 1–100, default `20`).
- **Request body**: none.
- **Response** (`200`):

```jsonc
{
  "hits": [
    { "id": 3, "name": "Information Technology", "slug": "information-technology" }, // id:int, name:string, slug:string
    { "id": 8, "name": "Banking & Finance",      "slug": "banking-and-finance" }
  ],
  "total": 22,
  "page": 1,
  "pageSize": 20
}
```

---

### Rules & notes

- **Field sources — do not add columns.** Models are defined in `packages/db/prisma/schema.prisma`: `Industry` (id, slug, name), `City` (id, slug, name, state, country), `Skill` (id, slug, name, category?, isCustom). The picker projections returned above are exactly what the website already selects — see `apps/web/app/onboarding/page.tsx` lines 33–35 (`skill.findMany {id,name,category}`, `city.findMany {id,name,state}`, `industry.findMany {id,name}`), plus `apps/web/app/profile/skills/page.tsx` lines 14–18 (adds `slug`, `take: 500`) and `apps/web/app/companies/page.tsx` lines 37–40 (industry `{id,slug,name}`). `slug` is included on all three because the app needs it to build search-filter deep links.
- **Sorting**: `orderBy: { name: 'asc' }` — the ordering every SSR catalogue query already uses. Add an `id` tiebreaker (`orderBy: [{ name: 'asc' }, { id: 'asc' }]`) so offset paging is deterministic on the non-unique `name` — same reasoning documented in `apps/web/app/companies/page.tsx` (the "unique `id` tiebreaker" comment ~line 47).
- **Pagination**: reuse the envelope + `PAGE_SIZE` pattern from `apps/api/src/saved-jobs/saved-jobs.service.ts` — `Promise.all([findMany({ skip:(page-1)*pageSize, take:pageSize }), count({ where })])` returning `{ hits, total, page, pageSize }`. Here `pageSize` is client-controllable (capped at 100) rather than the fixed `20`, because the pickers may want the whole small table in one round-trip.
- **Search filter parity**: today the web pickers download the full catalogue and filter client-side (the onboarding wizard has no server `q`); the `skill-jobs` / `city-jobs` handlers under `apps/web/app/[...path]/_handlers/` resolve a *single* slug via `prisma.skill.findUnique` / `prisma.city.findMany({ where:{ slug:{ in }}})`. The new `?q=` adds server-side name search (`contains`, `mode:'insensitive'`) so the mobile app isn't forced to pull every row — behaviourally a superset, not a change to existing SSR logic.
- **Visibility gates**: none. These tables have no status/soft-delete/publish column; all rows are public reference data. `Skill.isCustom` (user-typed skills created via `me/skills`) is **not** filtered, matching the SSR pickers which load custom skills too — keep parity. (Flag for product later if junk custom skills should be hidden from the picker, but do not diverge from SSR here.)
- **Controller & validation conventions**: one NestJS `@Controller('skills' | 'cities' | 'industries')` (or a single `CatalogsController`), each `@Get()` doing `Dto.safeParse(query)` → `throw new BadRequestException(parsed.error.issues)` on failure, exactly like `apps/api/src/saved-jobs/saved-jobs.controller.ts`. Define the Zod DTO alongside (`z.object({ q: z.string().trim().min(1).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() })`) following `apps/api/src/saved-jobs/dto.ts` (`z.coerce.number().int().min(1).optional()`). No `JwtAuthGuard`, no `CurrentUser`.


---

## Applications Dashboard — `GET /me/applications` (additive fields)

Two backward-compatible additions to the **existing** authenticated list endpoint so the Flutter app can render the same per-status counts and status timeline the website shows. No new route, no query-param changes, no removals — existing consumers are unaffected.

### GET /me/applications

- **Auth**: Session cookie (`JwtAuthGuard`) — controller is `@Controller('me/applications')` + class-level `@UseGuards(JwtAuthGuard)`; `user.sub` is the caller's `userId`. Not public.
- **Query params** (unchanged — validated by `ListApplicationsQueryDto`, Zod):
  - `status` — enum, default `ALL` (also applies when absent) — one of `ALL | APPLIED | IN_REVIEW | SHORTLISTED | INTERVIEWED | OFFERED | HIRED | REJECTED | WITHDRAWN`. `ALL` or absent → no status filter; any other value narrows `where.status`. Unknown values → `400`.
  - `page` — integer ≥ 1, default `1` (`z.coerce.number().int().min(1)`), 1-indexed. `pageSize` is fixed at **20**.
- **Request body**: none (GET).
- **Response** (`200`) — the existing `{ hits, total, page, pageSize }` envelope, now with a top-level `counts` object and a `statusHistory` array on each hit. **Full updated shape:**

```jsonc
{
  "hits": [
    {
      "id": 412,                                  // number — Application.id
      "status": "SHORTLISTED",                    // ApplicationStatus enum (current status)
      "appliedAt": "2026-07-30T09:15:00.000Z",    // ISO 8601 (Date serialized)
      "updatedAt": "2026-08-04T11:02:00.000Z",    // ISO 8601 (Date serialized)

      // NEW — additive. Raw Application.statusHistory JSON column, or [] when null.
      // One entry appended per transition by buildHistoryEntry() in state-machine.ts.
      "statusHistory": [
        { "from": "APPLIED",   "to": "IN_REVIEW",   "at": "2026-08-01T08:00:00.000Z", "by": "RECRUITER" },
        { "from": "IN_REVIEW", "to": "SHORTLISTED", "at": "2026-08-04T11:02:00.000Z", "by": "RECRUITER" }
        // from: ApplicationStatus | to: ApplicationStatus | at: ISO 8601 string | by: "CANDIDATE" | "RECRUITER" | "SYSTEM"
      ],

      "job": {
        "id": 88,                                 // number — Job.id
        "title": "Senior Backend Engineer",       // string
        "canonicalSlug": "senior-backend-engineer-acme-88", // string (build JD deep-link from this)
        "status": "ACTIVE",                       // Job.status string (ACTIVE | CLOSED | EXPIRED | ...)
        "company": {
          "id": 5,                                // number — Company.id
          "name": "Acme Corp",                    // string
          "slug": "acme-corp"                     // string
        }
      }
    }
  ],

  // NEW — additive. Per-status totals across ALL of the user's applications,
  // INDEPENDENT of the ?status= filter. ALL is always present (= sum).
  // Statuses with zero applications are OMITTED (groupBy returns only non-empty groups).
  "counts": {
    "ALL": 7,
    "APPLIED": 3,
    "IN_REVIEW": 1,
    "SHORTLISTED": 1,
    "REJECTED": 2
  },

  "total": 1,        // number — count matching the CURRENT filter (drives pagination, NOT counts)
  "page": 1,         // number — echoed, 1-indexed
  "pageSize": 20     // number — fixed
}
```

**Rules & notes**

- **Reuse `ApplicationsService.list()`** — `apps/api/src/applications/applications.service.ts` (`list(userId, { status, page })`). Both additions go here so the controller (`applications.controller.ts` `@Get() list()`) stays as-is.
- **Field (2) — `statusHistory` per row**: add `statusHistory: true` to the existing `prisma.application.findMany({ select: { ... } })` in `list()`. The column is `statusHistory Json?` on `model Application` (`packages/db/prisma/schema.prisma:1111`) — **nullable**; coalesce `null → []` before returning so the app always gets an array. Entry shape is authored by `buildHistoryEntry()` in `apps/api/src/applications/state-machine.ts` as `{ from, to, at, by }` (NOT `{ status, at }`). `at` is ISO 8601; `by` is the `Actor` union `CANDIDATE | RECRUITER | SYSTEM` (raw rows can contain `SYSTEM`). The website's `parseHistory()` in `apps/web/app/applications/page.tsx` (lines 47–63) drops malformed entries and only surfaces `by` when it is `CANDIDATE`/`RECRUITER`; `StatusTimeline.buildSteps()` in `apps/web/components/applications/StatusTimeline.tsx` treats each entry's **`to`** as the status reached at `at`. The app should mirror that: `to` = the reached status. Legacy/seeded rows may have `statusHistory: null` or `[]` — the timeline then shows only the synthetic APPLIED (+ current) step.
- **Field (1) — top-level `counts`**: add the third query already used by the SSR page — `prisma.application.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } })` (see `apps/web/app/applications/page.tsx` lines 106–119). Build `counts[status] = _count._all`, accumulate `counts['ALL'] = Σ`. **Always unfiltered** (`where: { userId }` only) — `counts` reflects every application regardless of `?status=`; it is filter-independent and must not be derived from `hits`/`total`. Keys are **sparse**: only statuses with ≥1 application appear, plus `ALL` (matches the website's `Record<string, number>` exactly — the `StatusFilter` chip component hides zero-count statuses).
- **Pagination / envelope**: keep the `{ hits, total, pageSize }` contract identical to `/me/saved-jobs` and the current `/me/applications` — `total` is the **filtered** count (`prisma.application.count({ where })`), `pageSize` is 20, `page` 1-indexed. See `apps/api/src/saved-jobs/saved-jobs.service.ts:107` for the matching shape.
- **Sorting**: `orderBy: { appliedAt: 'desc' }` (newest first) — unchanged, matches the SSR page.
- **Visibility gate**: rows are strictly scoped to the authenticated user (`where.userId = user.sub`); no additional publication/visibility filter — a user only ever sees their own applications, in any status.
- **Backward compatibility**: `counts` and `statusHistory` are purely additive; existing web SSR (which reads its own Prisma queries, not this endpoint) is unaffected, and existing API clients that ignore the new keys continue to work.

---

## 3. What the app already consumes (no change needed)

For the website developer's context, these already work against the current API and need nothing:

| Feature | Endpoint(s) | Status |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me` | ✅ Working |
| Profile | `GET /me/profile` (+ onboarding section writes) | ✅ Working |
| Saved jobs | `GET/POST/DELETE /me/saved-jobs` | ✅ Working |
| Applications | `GET /me/applications`, withdraw | ✅ Working (needs §9 additive fields for the timeline/counts) |
| Job alerts | `GET/POST/PATCH/DELETE /me/alerts` | ✅ Working |

Once endpoints 1–8 land, the app can build **Home, Job Search, Job Detail, Companies, and Career Advice** — reaching full parity with the website's job-seeker surface.

---

## 4. Suggested build order (backend)

Highest unblock-value first for the app:

1. **`GET /jobs`** + **`GET /jobs/:slug`** — the core browse/apply loop (biggest single unblock).
2. **`GET /skills` · `/cities` · `/industries`** — small, and they power the search filters + onboarding pickers.
3. **`GET /home`** — the app's landing tab.
4. **`GET /companies` + `/companies/:handle`** — companies tab.
5. **`GET /career-advice` + `/career-advice/:slug`** — content tab.
6. **`GET /me/applications` additive fields** — small, improves an existing screen.

Every one is a wrapper over code that already exists in the web app — the notes name the exact file/function to reuse so behaviour stays identical between web and mobile.

---

# ADDENDUM — 2026-08-15 · Round 2 requests

Everything in §1–§4 above has since **shipped** (thank you) and the app is live against it. This addendum is a **new, smaller set of three requests**, written after re-reading the current contract on `origin/develop` (`49b791e`). Each one opens with the evidence that it is genuinely missing, so nobody has to re-investigate.

Nothing here is urgent, and none of it blocks the app's current release.

---

## A. `GET /v1/jobs/suggest` — search type-ahead

### Evidence it is missing

`PublicJobsController` declares exactly two routes — `@Get()` (list) and `@Get(':slug')` (detail). There is no suggest/autocomplete route on the public API. A **working reference implementation already exists**, but only in the website: `apps/web/app/api/search/suggest/route.ts` — a Next.js route handler, not on the `/v1` surface, so the app cannot reach it.

**This should be a small change**: `suggestJobTitles` / `suggestCompanyNames` are already exported from `packages/search` over Elasticsearch completion suggesters. The ask is a thin controller method over proven code, not new search engineering.

> Skill / city / industry type-ahead is **already live** at `/v1/skills?q=`, `/v1/cities?q=` and `/v1/industries?q=`, and the app uses them. This request is only about job titles and companies.

### Route

```
GET /v1/jobs/suggest?q=fli&limit=8&type=jobs
```

> **Declaration order matters.** `@Get('suggest')` must be declared **above** the existing `@Get(':slug')`. Nest matches in declaration order, so a later declaration is swallowed by the `:slug` route and `/v1/jobs/suggest` resolves to `detail('suggest')` — a 404.

### Params (a `.strict()` Zod DTO, like the rest of that file)

| Param | Type | Notes |
|---|---|---|
| `q` | string, trimmed, 1–80 | required |
| `limit` | int 1–20, default 8 | matches the web handler's clamp |
| `type` | `jobs` or `companies`, default `jobs` | picks the suggester |

### Response

```json
{ "suggestions": ["Flutter Developer", "Flipkart", "Flutter Engineer"] }
```

Plain strings — matching `SuggestResult` in `packages/search/src/types.ts` and the existing web handler, so no change to `packages/search` is needed.

### Decisions we are asking you to make deliberately

1. **Fail soft.** On any Elasticsearch error, return `200 {"suggestions": []}` — not a 5xx, and not the `ServiceUnavailableException` the main jobs route uses. A type-ahead that errors mid-keystroke is worse than one that quietly returns nothing.
2. **Short timeout (~1s).** The shared ES client timeout is 10s; a suggestion request that hangs for ten seconds is useless, because the user has finished typing.
3. **Rate limit.** Please add an explicit `@Throttle` override. The global limit is 100 req/60s **per IP** across *all* endpoints, and on Indian mobile carrier NAT many users share one egress IP — an un-overridden type-ahead could 429 a user's whole session, job list and detail included. The app will debounce ~200ms and cancel in-flight requests regardless.
4. **Cache**: `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (the `/v1/home` precedent). No per-user field in the payload.

### Three limitations we would rather have documented than fixed

- **The `jobs` suggester returns a mixed list.** `title_suggest` is fed both the job title *and* the company name, so results interleave the two with nothing to tell them apart. The app will render them as one undifferentiated list. If you would rather they were separable, that needs a type discriminator in the response (and a reindex).
- **Prefix-only matching.** The completion suggester matches from the start of each input, so typing `developer` will *not* surface `Senior Developer`. We will write the UX copy accordingly. Infix matching would be a mapping/analyzer change plus a reindex — not worth it for this.
- **No status filter on suggestions.** Unlike `searchJobs` (which pins `status=ACTIVE`), the suggester has none, and de-indexing on job close is fire-and-forget. A failed de-index leaves a closed job's title suggestible indefinitely. Low stakes — a suggestion leads to a search, not to a dead job page — but worth knowing.

---

## B. `GET /v1/career-advice/topics` — the topic list, with counts

### Evidence it is missing

`PublicArticlesService.list` returns exactly `{ hits, total, page, pageSize }` — no facet or topics block — and `PublicArticlesController` has only `@Get()` and `@Get(':slug')`.

### The app-side defect this fixes

The app currently builds its topic chips by accumulating tags from whichever articles happen to have loaded. That is wrong the moment there is more than one page: topics that appear only on page 3 are invisible until the user pages that far, and the chip set shifts as they scroll.

### Route

```
GET /v1/career-advice/topics
```

> Same declaration-order requirement: **above** `@Get(':slug')`, or it resolves to `detail('topics')`.

No query params — this is the complete list, deliberately unpaginated.

### Response

```json
{ "topics": [{ "slug": "interview-tips", "count": 12 }], "total": 37 }
```

`total` is the count of PUBLISHED articles, so the app can render an "All (37)" chip without a second call. Sort by `count` descending, tie-break `localeCompare` on slug — byte-identical to the website's ordering, so the two surfaces show chips in the same order.

### Notes for the implementer

- **Counts should be GLOBAL** — independent of any active tag, `q` or page, mirroring the website. Query-scoped counts would make every chip's number change as the user filters, and the selected chip's count would always equal the result total while every other chip read 0.
- `Article.tags` is a Postgres `String[]` with a GIN index and **no Tag join table**, so `prisma.groupBy` cannot group by array elements. Recommended: `SELECT unnest(tags) AS slug, count(*) FROM "Article" WHERE status='PUBLISHED' GROUP BY 1` via `Prisma.sql`, which pushes the work to Postgres.
- **Please return only slug-shaped tags** (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — the same `SLUG_RE` the shared parser enforces). A non-slug tag is silently coerced to null by the parser and the filter is then skipped, so such a chip would return *unfiltered* results: a chip that looks like it works and does not.
- **No display label exists** anywhere in the database or in a shared package; the website derives one with a presentation-only helper the API cannot import. Returning the slug alone is fine — the app will title-case it. Flagging it only because app and website labels may then diverge slightly.
- `Cache-Control: public, s-maxage=1800, stale-while-revalidate=600`. The payload is identical for every caller and articles publish infrequently.

---

## C. Profile views — currently a dead counter on **both** surfaces

### This one is a bug report first, a feature request second

`Candidate.profileViews` is a non-nullable `Int @default(0)` that **nothing in the repository ever writes**. `git grep -n "profileViews" origin/develop` returns 7 hits: 1 schema field, 1 migration DDL, and 5 reads. There is no `ProfileView` model, no view-event table, and no increment anywhere.

It is already on the wire to us — `GET /me/profile` returns the full `Candidate` row — so the app *could* render it today. **We deliberately have not**, because it would ship a confident, permanent zero.

> **Please also look at `apps/web/app/profile/page.tsx`**, which renders a "Profile views" StatCard bound to this same never-incremented column. Right now it tells every job seeker they have 0 profile views, forever. Either the tracking ships or that card should come out — your call. We are only flagging it because we found it while checking whether the app was behind the website here. It is not.

### If you do build it

**Schema** — a view-event table rather than only a counter, so "last 30 days" is answerable:

```prisma
model CandidateProfileView {
  id              Int       @id @default(autoincrement())
  candidateId     Int
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  recruiterUserId Int
  companyId       Int?
  viewedAt        DateTime  @default(now())
  @@index([candidateId, viewedAt])
}
```

> Named `CandidateProfileView`, **not** `ProfileView` — there is already an exported TypeScript interface called `ProfileView` in `apps/api/src/profile/profile.service.ts`, and a Prisma model of that name would collide with it on import.

**Write hook** — record where a recruiter demonstrably looks at *one* person. Please do **not** hook the applicants *list* route; a single page render would inflate 20 candidates at once. The single-applicant surfaces (the resume view, for example) are the right place. De-duplicate per recruiter/candidate/day.

**Read endpoint** — `GET /v1/me/profile-views`, JWT-guarded, candidate-only. Note it must declare `@Controller({ path: 'me/profile-views', version: '1' })` explicitly, or it lands unversioned.

```json
{ "totalViews": 42, "last30Days": 9, "lastViewedAt": "2026-08-14T09:12:00.000Z" }
```

**Privacy** — please expose **company-level attribution only** (company name / logo), never the viewing recruiter's name, email or user id.

**The one thing we most need**, whatever shape you choose: **a capability signal.** Because the counter is a non-nullable Int defaulting to 0, the app cannot tell "nobody has viewed you" from "tracking was never implemented" — and those need completely different UI. A boolean (`profileViewsTracked: true` on `GET /me/profile`), or simply the route existing and returning 200, is enough.
