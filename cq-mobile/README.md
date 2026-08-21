# CQ — Career Queue (Mobile)

The **Career Queue** job-search app for **Android & iOS**, built with Flutter.
A native client of the Career Queue platform — job seekers search jobs, apply,
track applications, save jobs, set alerts, and manage their profile & resume,
backed by the same API and database as the web app.

> India-focused job search. Real jobs, real companies. No ads.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Flutter 3.41 · Dart 3.11 |
| State management | Riverpod |
| Navigation | go_router |
| Networking | Dio — cookie session, single-flight refresh |
| Models | hand-written `fromJson` (no codegen) |
| Secure storage | flutter_secure_storage (Keystore / Keychain) |
| Design | Material 3 · Inter (bundled) · light + dark |

The session is **cookie-based**, not a bearer token: the API sets
`access_token` / `refresh_token` and `CookieManager` replays them. A 401
triggers a single-flight refresh, and only an explicit server refusal ends the
session — an unreachable server keeps it.

Models are written by hand on purpose, so every field and its JSON mapping is
readable in one place. There is no `build_runner` step.

## Features (job seeker)

Working today:

- Email + password sign-in, registration, password reset
- Home feed, job search with filters, job detail
- Apply, with the daily quota surfaced
- Saved jobs · application tracking · job alerts (email)
- Profile, résumé upload, education / experience / skills / projects / languages
- Company directory & profiles · career-advice articles
- Report a job · in-app account deletion

**Not built.** Listed because the screens exist and can mislead:

- **Google and Apple sign-in.** The buttons are written but hidden behind
  `AppConfig.showAuthAlternatives` (default off). Google needs an OAuth client
  ID and a second, token-based session path; Apple is not implemented at all.
- **Phone / OTP sign-in.** The screen exists and is gated off. The platform has
  no SMS provider.
- **Push notifications.** No implementation of any kind — no FCM, no APNs, no
  plugin. Job alerts are **email only**.

## Project structure

```
lib/
  core/        # theme, networking, router, config, formatting
  features/    # one folder per feature (auth, jobs, profile, …)
  shared/      # shared widgets & utilities
test/          # 436 tests
docs/          # readiness report, privacy-form answers, work tracker
```

## Getting started

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

Requires the Career Queue API to be running and reachable from the device. The
base URLs **default to localhost**, which is right for development and wrong for
any build that leaves this machine — see `docs/PUBLISHING_READINESS.md`.

```bash
bash tool/verify.sh     # analyze + test, the gate that runs today
```

## Branching

| Branch | State |
|---|---|
| `feature/auth` | **Where the current app lives.** All recent work is here. |
| `develop` | Behind. Do not build from this. |
| `main` | Behind. Do not build from this. |

The app has no GitHub remote of its own. Its only hosted copy is the
`app/cq-mobile` branch of the `jobportal` monorepo, under `cq-mobile/`. That
placement is also why CI cannot run: GitHub Actions only reads
`.github/workflows/` at a repository root.

## Status

Feature work for the seeker app is essentially complete and **it cannot be
published yet**. The blockers are a deployed API, working transactional email,
published legal pages, a signing keystore, and — for iOS — a Mac.

**The app has never been run on a physical device against a live server.**

`docs/PUBLISHING_READINESS.md` is the full picture, `docs/TRACKER.xlsx` the
item-by-item detail, and `docs/DATA_SAFETY.md` the prepared answers for the Play
and Apple privacy forms.

---

© 2026 Career Queue. All rights reserved.
