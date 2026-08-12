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
| Networking | Dio (JWT auth + refresh) |
| Models | freezed + json_serializable |
| Secure storage | flutter_secure_storage |
| Design | Material 3 · Inter · light + dark |

## Features (job seeker)

- Authentication — email/password + Google sign-in
- Home feed & job search with filters
- Job details · apply · save
- Application tracking
- Saved jobs
- Job alerts + push notifications
- Profile & resume
- Company directory & profiles
- Career-advice articles

## Project structure

```
lib/
  core/        # theme, networking, router, config
  features/    # one folder per feature (auth, jobs, profile, …)
  shared/      # shared widgets & utilities
```

## Getting started

```bash
flutter pub get
flutter run
```

Requires the Career Queue API to be running and reachable from the device.

## Branching workflow

| Branch | Purpose |
|---|---|
| `main` | Stable / release only |
| `develop` | Integration (default branch) |
| `feature/*` | One feature each → PR into `develop` |

## Status

In active development — the job-seeker app, built feature by feature.

---

© 2026 Career Queue. All rights reserved.
