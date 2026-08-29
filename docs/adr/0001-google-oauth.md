# ADR 0001 — Google OAuth ("Continue with Google")

- **Status**: Accepted
- **Date**: 2026-06-20
- **Deciders**: Prakash (owner), via the auth-popup work on `feature/navbar-ui`
- **SRS**: §4.12.6 (FR-4.12.6) Authentication & Authorization

> Note (updated 2026-08-29): this ADR is now **tracked and pushed**. The
> `!/docs/adr/` carve-out it asked for was added by
> `feature/sadmin-roles-permissions` (2026-08-22), and the file was committed on
> the owner's instruction so both other developers get it on their next `git
> pull`. Everything else under `docs/` — including the SRS PDF — stays local.

## Context

FR-4.12.6 states: *"System SHALL support OAuth via Google and LinkedIn (Phase 2)."*
Social login is **in-spec but scheduled for Phase 2**; the project is in Phase 1
(Freemium MVP). The owner asked to add "Sign in / Sign up with Google" to the new
auth popup now. The shipped auth system (PR #5) is email + password only — custom
JWT (HS256, 15-min access / 30-day refresh, rotated) + Argon2id, with sessions in
the `Session` table. **NextAuth is forbidden** (CLAUDE.md §1). The SRS gives no
OAuth flow detail (no mention of PKCE/state/nonce) — that gap is closed here.

## Decision

Pull **Google** OAuth into Phase 1 (LinkedIn deferred). Implementation:

1. **Flow**: server-side **Authorization Code + PKCE (S256) + signed CSRF `state`**.
   Browser → `GET /auth/google` (302 to Google) → consent → `GET /auth/google/callback`
   → the API exchanges the code (with `client_secret` + PKCE verifier) over TLS,
   validates the `id_token` (`aud`/`iss`/`exp`/`email_verified`), resolves the user,
   mints **our existing session cookies**, and 302s back to the web app. No Google
   JS SDK and **no new dependency** (`google-auth-library` was considered and rejected
   — a direct `fetch` token exchange + `id_token` validation is sufficient because the
   token arrives over our authenticated server-side channel). PKCE state + verifier
   ride a short-lived (`10 min`) httpOnly, `SameSite=Lax`, `path=/auth/google` cookie.

2. **Unified "Continue with Google"**: one flow; both buttons hit `/auth/google`.
   - Existing Google account → sign in → `/profile` (the de-facto seeker dashboard;
     there is no `/dashboard` in the web app) or the `?next=` deep-link.
   - Matching email on a password account → **link** Google to it (Google verified the
     email) and sign in; the password still works.
   - Brand-new → create a `CANDIDATE` (no password), provision the `Candidate` row,
     `emailVerified = true`, then **`/onboarding`** to confirm the display name
     (prefilled from Google, editable) while the email is locked.

3. **Reuse the trust boundary**: the callback converges on `AuthService.issueSession()`
   (extracted from `login()`), so the `/auth`-scoped refresh cookie + Session rotation
   model are unchanged. Routes live under `/auth/*` so the refresh cookie path holds.

4. **No-op gating**: blank `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` →
   `GoogleOAuthService.isConfigured()` is false, the routes 404, and the web hides the
   buttons (it reads `GET /auth/google/status`). Same idiom as Resend/R2/Sentry. This
   is **free** functionality, so no feature-flag (CLAUDE.md §4) is required.

5. **Schema** (one additive migration, `20260620120000_google_oauth`): `User.passwordHash`
   → nullable; add `provider AuthProvider @default(LOCAL)`, `googleId String? @unique`,
   `image String?`. Non-destructive (existing rows backfill `provider='LOCAL'`).

## Consequences

- **Positive**: in-spec feature delivered; reuses the existing JWT/session/cookie
  machinery; zero new runtime dependency; secret stays server-side; ships dark (no
  user impact) until the owner provisions Google Cloud credentials.
- **Negative / follow-ups**:
  - Requires owner-provisioned Google Cloud OAuth credentials to activate (cannot be
    tested live without them).
  - The header is still not auth-aware (chip #9) — a logged-in seeker has no visible
    link to `/profile` post-login.
  - Pulls Phase-2 scope into Phase 1 (deliberate, owner-approved).
  - `/onboarding` is reachable by any signed-in user (it's just a name-confirm screen);
    the callback only routes brand-new accounts there.
- **Deferred**: LinkedIn (the second SRS-named provider) — the `AuthProvider` enum +
  service shape leave room to add it with minimal change.
- **Security**: meets SRS §5.2 / CLAUDE.md §9 — httpOnly `Secure`(prod) `SameSite=Lax`
  cookies, HS256, refresh rotation; adds PKCE + CSRF state (the SRS gap). Password login
  is rejected for passwordless (OAuth-only) accounts with a constant-time dummy verify.
