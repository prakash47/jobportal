# ADR 0007 — Platform-staff RBAC for the Super Admin portal

- **Status**: Accepted
- **Date**: 2026-08-22
- **Branch**: `feature/sadmin-roles-permissions` (PR A of 2)
- **SRS**: §4.16 (admin console), §4.12 (auth), FR-4.12.10
- **Supersedes**: nothing. **Amends**: the unqualified reading of CLAUDE.md §9.

## Context

`/sadmin` had exactly one privilege level. `User.role === 'ADMIN'` was the whole
model: eight sites in the repo compared that field to the literal string, and
whoever held it held everything — billing grants, the revenue ledger and its
export, candidate PII, job takedowns, platform-wide broadcasts, signup-OTP code
reveal, and the feature-flag killswitches.

The owner asked for sub-admin/staff accounts with role-based access control
(Support / Content / Finance) and per-role permission scopes.

Three facts from recon shaped every decision below:

1. **There is no working permission enforcement anywhere in this repo to copy.**
   `apps/api/src/recruiter-users/permissions.ts` is a complete, tested scope
   taxonomy whose `hasModuleAccess`/`meetsLevel` have **zero production callers**
   — verified by grep; every hit outside the module is its own test. It ships
   stored-and-displayed but never enforced.
2. **Most of the admin surface never reaches a guard.** 30 routes across 9
   controllers are `AdminGuard`-protected, but **24 modules under
   `apps/sadmin/lib` query Postgres directly from RSCs** per the repo's
   reads/writes split. The revenue ledger and the candidate PII screen are both
   on that side.
3. **A privilege in the JWT could not be revoked.** `apps/sadmin` never calls
   `/auth/refresh` (grep: zero hits) and `AccessClaims` carries no `jti`, so a
   token-borne scope would stand for its full 15 minutes with no lever to pull.

## Decision

### 1. A sidecar table, not new `UserRole` members

`AdminStaff` (`userId @unique`, `staffRole`, `permissions Json?`,
`deactivatedAt`, `createdById`). Every staff member keeps `User.role = 'ADMIN'`.

`UserRole` is a single scalar baked into the access token. Adding
`SUPPORT_ADMIN` to it would make all eight `=== 'ADMIN'` sites reject the very
staff it created; widening all eight would hand every sub-admin the OTP reveal
and the ledger export. There is no middle setting of that dial — the middle has
to be a second dimension. `schema.prisma:566` already recorded this conclusion
for the recruiter case: *"Do NOT overload UserRole for this."*

### 2. The scope map is read per request, from the database

`AdminGuard.canActivate` becomes `async` and loads the row on every admin
request; `requireAdminStaff()` does the same for every RSC page. This is the
cost that buys revocation: it takes effect on the staffer's next click instead
of up to 15 minutes later. It also sidesteps a fail-open trap —
`verifyAccessToken` blind-casts its payload, so any token minted before this
feature deployed would carry `permissions === undefined`, and the natural
`claims.permissions?.includes(...)` check would wave it straight through.

### 3. Eight modules × three levels, with two deliberate splits

`support`, `moderation`, `finance`, `users`, `verification`, `otp_reveal`,
`communications`, `system` — each `NONE`/`READ_ONLY`/`EDIT`.

- **`otp_reveal` is separate from `verification`.** Revealing a signup OTP hands
  staff the code to complete someone else's login. It is an account-takeover
  primitive that happens to be a *read*, so folding it under `verification`
  would mean granting a support agent KYC visibility silently also granted them
  every user's live login code. It defaults to `NONE` for all three assignable
  tiers.
- **`system` covers feature flags *and* staff management, and is
  non-overridable.** They are one privilege wearing two hats: flag write
  disables the killswitches gating every other module, and staff edit grants any
  module directly. `clampSystem()` forces this module to the role default
  regardless of the stored blob — enforced in the resolver rather than only in
  the update DTO, because a permissions JSON reaches that column from the API,
  the seed, and psql.

The taxonomy lives in `@jobportal/domain` so `apps/api` and `apps/sadmin` share
**one** copy. The recruiter equivalent was already hand-duplicated into
`apps/recruiter`; a third copy is how two enforcement points drift into
disagreeing about who may do what.

### 4. Layer 2 carries real weight in `apps/sadmin`, and a test enforces it

CLAUDE.md §4 says the API is the only trusted enforcement point. **That does not
hold for this portal's reads**, and pretending otherwise would have shipped a
Finance Admin who cannot export the ledger but can read every rupee of it on
screen. So all 22 pages under `app/(authed)/` call
`requireAdminScope(module, level)`, declared once per segment in
`lib/roles/scope-map.ts`.

Because a by-convention gate is one forgotten call from being open,
`scope-map.test.ts` asserts three things against the real filesystem and the
real page source: every segment has an entry, every `page.tsx` actually calls a
gate, and the module a page passes matches the one its segment declares. With no
CI and no working `pnpm lint`, a failing unit test is the only mechanism in this
repo that a person cannot forget to run.

### 5. An un-annotated API route requires `system`/`EDIT`

Not allow (every future admin route silently open, invisible in review) and not
deny-all (a forgotten annotation takes the console down for the only person able
to fix it). A new route is reachable by the super admin and nobody else; the
omission surfaces as a bug report, not an incident.

### 6. An `ADMIN` with no staff row has no access

Fail-closed. CLAUDE.md §9 makes admins with a bare `UPDATE "User" SET role=...`,
so this is the normal state of a hand-promoted account, and it must hold nothing
until a tier is granted deliberately. The seed provisions the row for
`admin@careerqueue.in` so "pull, seed, sign in" stays true.

### 7. Staff are deactivated, never deleted

`ProfileAuditLog.user` is `onDelete: Cascade`. Hard-deleting a staff `User` would
silently destroy every KYC approval, OTP reveal, ledger export and takedown that
person ever logged — the audit trail would lose exactly the records that matter
most, and lose them quietly.

### 8. FR-4.12.10 is split, not overturned

*"ADMIN role is assigned only via direct DB write — never via UI"* remains
**entirely true as of PR A**: nothing in the product creates a staff account.
PR B relaxes it for the three lesser tiers only. **`SUPER_ADMIN` — the tier that
can grant every other tier — stays seed-or-psql forever**, so no one can
bootstrap themselves to full power through a web form. That is the property
FR-4.12.10 exists to protect, and it survives intact.

## Consequences

**Good.** Revocation is immediate. The token contract is untouched, so no
existing session breaks and no client changes. The blast radius of a stolen
staff cookie is now bounded by that account's tier. `system` cannot be reached
by any override. Coverage of new routes is a build failure rather than a code
review.

**Costs, accepted.** One indexed query per admin request and per RSC page.
`AdminGuard` gained a `Reflector` dependency (still no module wiring — Nest core
provides it). `apps/web/lib/auth/require-admin.ts` now queries Postgres, which
it did not before.

**Known gaps at the end of PR A.**

- No console and no invites — that is PR B. Sub-admins can currently only be
  created by direct DB write.
- **The sidebar is not filtered by scope.** It needs props on a props-less
  client component whose `NAV_ITEMS` the planned
  `feature/sadmin-admin-migration` will append to, and a signature change plus
  an append to one locked file is the worst conflict to hand a teammate. Until
  PR B, an out-of-scope nav link 404s — safe, not pretty.
- **The dashboard is `ANY_STAFF`.** It is the post-login landing page, so gating
  it on a module would bounce a Support Admin off the first screen they see. Its
  individual KPI cards are not yet filtered by module, so a sub-admin sees
  platform-wide counts (not records) outside their domain. Worth closing in PR B.
- `apps/web/app/admin/**` still exists and is now SUPER_ADMIN-only. The right
  fix is deleting it, which `feature/sadmin-admin-migration` does.

## Alternatives rejected

- **Widen `UserRole`.** Breaks eight call sites in one direction or grants
  everything in the other. Explicitly warned against in the schema.
- **Scopes in the JWT.** Unrevocable here, and fails open on every pre-deploy
  token because `verifyAccessToken` blind-casts.
- **Migrate the 24 direct-Prisma reads behind scoped API endpoints.**
  Architecturally correct and the long-term answer, but six console domains have
  no API endpoints at all today. That is a multi-PR project, not a sub-task of
  this one.
- **Scope writes only.** Cheapest and dishonest: the point of a Content Admin is
  that they do not see revenue and candidate PII.
- **Reuse `RecruiterInvite` / `Recruiter.permissions` directly.**
  `RecruiterInvite.companyId` is a non-nullable FK with `onDelete: Cascade`, and
  platform staff have no company. The shape ports; the table cannot.
