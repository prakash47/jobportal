# Spec request: native Google sign-in for the mobile app

**For:** JobPortal backend / web developer
**From:** CQ mobile app
**Status: DELIVERED — this spec is now implemented on `develop`.** See the "As built" section immediately below; the original request is kept underneath for history. What remains is **configuration**, not backend code.

---

## As built (verified on `origin/develop`, 2026-08-15)

Shipped in `feat(auth): mobile Google + Apple sign-in per ADR 0002`
(`apps/api/src/auth/mobile-auth.controller.ts`, `social-client-ids.ts`).

**Two endpoints, not one — and they return body tokens, not cookies:**

```
POST /v1/auth/mobile/google   { "idToken": "<Google ID token>" }
POST /v1/auth/mobile/apple    { "idToken": "<Apple ID token>", "name": "<optional, first sign-in only>" }
```

Both answer with the same session shape as `/v1/auth/mobile/login`:

```json
{
  "user": { "id", "email", "name", "role", "emailVerified" },
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

So the app cannot reuse its cookie jar for this path — it must store the tokens
(`flutter_secure_storage`) and send `Authorization: Bearer`, refreshing via
`POST /v1/auth/mobile/refresh { refreshToken }`. **The refresh token rotates on
every use**: persist the new one from each response, the old one is dead.

Error contract:
- `401` — token invalid, expired, wrong audience, or provider email unverified. Deliberately opaque; no detail about which check failed.
- `400` (Apple only) — Apple omitted the email claim on a repeat sign-in; the user must remove the app from their Apple ID and sign in again.
- `503` — the provider's key endpoint is unreachable. **Retry, do not re-authenticate** — this is an outage, not a bad credential.

### What still blocks the app — configuration, all outside the app's control

The verifier pins the token's `aud` to a configured allowlist, and
**unset means disabled**: with no env value, every token is rejected. So this
must happen before the Flutter side can work at all:

1. **Create an Android OAuth client** in Google Cloud Console for the CQ app —
   needs the package name and the **SHA-1 of the signing keystore** (debug and
   release are different keys, so register both, or Google sign-in will work in
   debug and fail in release).
2. **Create/keep a Web OAuth client.** On Android the `google_sign_in` plugin
   only returns an `idToken` when given the *web* client id as `serverClientId`;
   the Android client id alone yields no ID token to post.
3. **Web dev sets the API env**: `GOOGLE_MOBILE_CLIENT_IDS=<android id>,<web id>`
   (comma-separated) on every environment the app talks to. `GOOGLE_CLIENT_ID`
   (the existing browser one) is appended automatically, so it need not be repeated.
4. Apple additionally needs `APPLE_CLIENT_IDS` — **no fallback at all** — plus a
   paid Apple Developer account. On Android, Apple sign-in is a web flow.
   Recommend deferring Apple until iOS work actually starts; Apple only *requires*
   it when the iOS build also offers another social sign-in.

Once 1–3 are done, the app side is: add `google_sign_in`, get the `idToken`,
POST it, store the tokens. That is a small change and is deliberately not
written yet — untestable auth code sitting in the tree is worse than none.

---

## Original request (kept for history — now implemented)

## Why this is needed

The mobile app cannot use the current Google flow. Today the backend only exposes a **browser redirect** flow:

- `GET /auth/google` → 302 to Google
- `GET /auth/google/callback` → 302 back to `WEB_URL` and sets cookies

Both are browser-only: the callback redirects to the **website**, not the app, and there is no way for a native app to complete the exchange. So the app currently shows Google as "coming soon".

Native apps sign in differently: the `google_sign_in` SDK does the Google consent on-device and hands the app a signed **ID token (JWT)**. The backend just needs one endpoint that accepts that token, verifies it, and starts a session.

---

## What to add — ONE endpoint

```
POST /v1/auth/mobile/google
```

### Request body
```json
{ "idToken": "<Google ID token JWT from google_sign_in>" }
```

### Server steps
1. **Verify the ID token** with Google's public keys (e.g. `google-auth-library`'s `verifyIdToken`):
   - signature valid and not expired
   - `aud` (audience) is one of **our** Google OAuth client IDs (Android + iOS client IDs — see config below)
   - `iss` is `accounts.google.com` / `https://accounts.google.com`
   - `email_verified === true`
2. Extract `email`, `name`, and `sub` (Google user id) from the verified token. **Never** trust an email the client sends outside the token.
3. Reuse the existing services — no new user logic needed:
   - `GoogleOAuthService.findOrCreateUser({ email, name, googleId: sub })` (the same find-or-create the web callback already uses)
   - `AuthService.issueSession(user)` to mint the session
4. **Set the same session cookies as `POST /auth/login`** (HttpOnly access + refresh) and return the user.

### Response — mirror `POST /auth/login` exactly
```
200 OK
Set-Cookie: <access cookie; HttpOnly; Secure; SameSite=Lax>
Set-Cookie: <refresh cookie; HttpOnly; Secure; SameSite=Lax>

{ "user": { "id", "email", "name", "role", "emailVerified" } }
```

> Returning the **same cookie + `{ user }` shape as `/auth/login`** means the mobile app needs zero token-handling changes — its cookie jar already captures the session. (If you'd rather return body tokens like `/v1/auth/mobile/login`, that's fine too — just tell us which and we'll adapt the client.)

### Errors
- `401` — token invalid / expired / wrong audience → app shows "Google sign-in failed, please try again."
- `403` — Google login disabled (mirror `GET /auth/google/status`).

---

## Config the backend needs
- The **Android OAuth client ID** and **iOS OAuth client ID** (and the existing Web/server client ID) added to the allowed **audiences** for token verification. We'll generate the Android/iOS client IDs in Google Cloud Console and share them.
- Keep `GET /auth/google/status` → `{ "enabled": boolean }` working — the app uses it to show/hide the Google button.

---

## Client side (already handled by the app once the endpoint exists)
1. `google_sign_in` → user picks account on-device → app gets `idToken`.
2. `POST /v1/auth/mobile/google { idToken }`.
3. Cookies set → session live → same as email login.

No push/deep-link infrastructure required — the ID-token exchange happens entirely over HTTPS.

---

## Optional (nice-to-have, NOT blocking)

`POST /v1/auth/mobile/reset-password` returning the mobile session shape. Password reset **already works** in the app today via the existing 3-step flow (`/auth/forgot-password` → `/auth/verify-reset-otp` → `/auth/reset-password`); step 3 sets cookies, so the app is signed in on success. A dedicated mobile variant would just make it a single clean call. Skip unless you're touching that area anyway.
