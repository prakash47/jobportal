# CQ Mobile — publishing readiness

**20 August 2026**

Every figure here was recomputed and every claim re-checked against both
codebases before this version was written. An earlier draft of this document
overstated several things; what it got wrong is listed at the end, because a
reader who has seen the first version deserves to know what changed.

---

## The short version

The app's own code is in good shape. **It cannot be published yet, and the
blockers are bigger than "one deploy".**

Three of them would each, on their own, make a public launch fail for real
users — not at review, but afterwards:

1. **No production API host.** A release build compiles against `127.0.0.1`, so
   on anyone else's phone the app reaches nothing.
2. **Email cannot be delivered.** `ResendClient` returns early and logs when
   `RESEND_API_KEY` is unset, which is its state in every environment file. Apply
   is hard-gated on `emailVerified` server-side, so a real user registers, no
   verification email arrives, and **Apply refuses forever**. The verification
   link also points at a website page that does not exist.
3. **Search needs Elasticsearch provisioned and indexed**, not just an API
   process. Without it the jobs list — the app's main screen — returns nothing
   while auth and profile look healthy.

None of the three is app-development work.

---

## What was done on the app side

An audit of the codebase produced 65 findings, classified by what each actually
depends on. Of the 35 that depend on nothing external, **31 are closed**.

### Defects that reached real user data

- **Editing a project or a language destroyed it.** Neither endpoint has a
  PATCH, so an edit deleted the row and created a replacement — and when the
  create failed the entry was gone with no message. Reproducible by renaming a
  language to one already on the profile.
- **The profile editor silently changed a candidate's salary.** It rounded the
  stored value to whole lakhs on load and multiplied it back on save, so opening
  the editor to fix a headline moved ₹8,50,000 to ₹9,00,000.
- **Clearing a field did nothing.** An absent key means "no change" on a PATCH,
  and both editors skipped empty values, so deleting a headline or a grade
  appeared to save and came back on the next load.
- **The same field was collected in two units** — rupees in onboarding, lakhs in
  the editor — and the current-salary field had no editor at all, so a wrong
  entry there could never be corrected.
- **Stale jobs read as "posted today".** Parsers substituted the current time for
  a missing timestamp.
- **A failed refresh threw away the screen.** Now fixed on **all eight**
  pull-to-refresh screens through one shared rule. (The first version of this
  document claimed this was done; it had in fact landed on two of the eight, and
  the other six were fixed after the recheck.)

### Security

- The debug request log printed **plaintext passwords, OTP codes and reset
  tickets** to the device log. A debug APK is exactly the build handed to a
  colleague, so "debug only" is not containment. Secrets are now redacted.
- Session cookies and the cached identity are keystore-backed, OS cloud backup is
  off, and logout clears the local session even when the server call fails —
  previously a failed logout left a live 30-day refresh cookie on the device
  while the app showed the welcome screen.
- Release builds are HTTPS-only. The cleartext exception covers `127.0.0.1`,
  `localhost` **and `10.0.2.2`** — the third is the emulator's host alias, which
  on a physical device is a routable private-LAN address, not loopback. Not a
  store blocker; worth knowing it is not zero-exposure.

### Store compliance

- **Six visible sign-in controls did not sign anyone in** — the App Store 2.1
  rejection pattern. All six are now behind a compile-time flag. Five were found
  in the first pass; the sixth, "Sign up with Google" on the registration screen,
  survived because the guard test mounted only two screens. It is fixed, and the
  guard now covers every auth screen a user can reach.
- The iOS target was named "Cq Mobile", carried no usage-description strings, and
  declared landscape and iPad support for layouts that do not exist.
- Two buttons were **clipped at the largest system font size** — the Apply button
  and "Continue with Google".
- In-app account deletion is **built and unit-tested against a stubbed
  transport**. It has never run against the real server, and the settings screen
  that hosts it has 1 of 165 lines under test.

### Correctness and messaging

Nine defects where the app spoke over the server: an hour-long login lock-out
reported as "wait a minute"; the password-reset attempt countdown discarded;
validation errors reduced to "Please check your details"; every code-less refusal
on Apply reported as an unverified email, including the two that mean the job has
closed; a raw `ThrottlerException` class name shown to the candidate; and a quota
refusal that could not disable the Apply button.

### Engineering baseline

| | Before | Now |
|---|---|---|
| Automated tests | 9 | **436** |
| Analyzer issues | 0 | **0** |
| Repositories with tests | 0 of 6 | **20 of 20** |
| End-to-end journeys | 0 | 2 |
| **Line coverage** | — | **40%** |

Six paths that had no coverage now have it: login, registration and password
reset; the router's authentication gate; the apply flow's failure branches;
search filtering; the repositories; and **seven of the twenty-one screens** via
smoke tests.

**Read the coverage figure, not the test count.** 436 tests sounds broader than
40% line coverage is. Fifteen user-facing screens and sheets execute **zero**
lines — including registration, forgot-password, the onboarding wizard and
settings. The repository and formatting layers are well covered; the screen layer
largely is not.

---

## How this was verified, and what was not

Every fix was checked by **restoring the original bug and confirming the test
failed**, then restoring the fix. That process caught five tests written during
this work that stayed green when the defect was reintroduced; they were rewritten.

**Not verified:**

- **Nothing was run on a physical device.** The Gradle daemon on this machine has
  been failing with a loopback fault since 02:00 on 19 Aug. The OS, the JVM,
  memory, disk, the daemon registry and the virtual adapters were each ruled out;
  it is machine-level and needs a reboot. **No APK or App Bundle exists.**
- **No Android App Bundle has ever been built**, and **CI cannot build one
  today** — see below.
- **iOS has never been built at all.** No CocoaPods setup, no signing identity,
  no Mac.
- The 436 tests are unit and widget tests. **No run against a live API.**

---

## What is blocking publication

### Owner — accounts and credentials

| Item | Why it blocks |
|---|---|
| **Android release keystore** | Play rejects an upload signed with the debug certificate, which is what release builds still use. Losing this key later means never being able to update the app. |
| **Play Console + Apple Developer accounts** | No listing, no upload. Apple's is a yearly fee. |
| **A Mac** | iOS cannot be built, archived or submitted without one. No workaround. |
| **A demo account for both review teams** | Nothing in the app is reachable signed-out, so a reviewer with no credentials sees only the welcome screen. Apple 2.1 requires this. |
| **Store listing assets** | Screenshots, descriptions, category, content rating. |
| **Two privacy answers** | Retention after deletion, and whether sending a profile to a recruiter is declared as third-party sharing. Both are business decisions; `DATA_SAFETY.md` has the rest. |

### Website and backend

| Item | Why it blocks |
|---|---|
| **Production HTTPS API host** | Release builds reach `127.0.0.1`. |
| **Elasticsearch provisioned and indexed** | Without it the jobs list is empty while everything else looks fine. |
| **Working transactional email** | `RESEND_API_KEY` unset means no verification email, and Apply is gated on verification. **A launch without this produces users who can never apply.** |
| **A `/verify-email` page on the website** | The link in the verification email has nowhere to land. |
| **Public website URL** | Every job and company link shared from the app points at `localhost`. |
| **Privacy policy, terms, and a web deletion page** | Both stores require the policy URL; Play requires web-based deletion in addition to the in-app path. None exist. |
| **Object storage (R2) configured** | Unconfigured, uploads fall back to an in-memory map — every résumé is lost on restart, silently. |
| **`TRUST_PROXY` set** | Unset behind a proxy, every rate limit keys on the proxy's IP, so one abusive client locks out everyone. |
| **Résumé virus scanning** | Currently a stub that always returns CLEAN, on a public file-upload path whose files are served to recruiters. |
| **`endDate` nullable in the experience DTO** | One word plus its two `.refine` guards. Until then "I currently work here" leaves the old end date in the database. |
| Search type-ahead, career-advice topic counts, company job filter, phone-OTP | Four gaps behind app screens. Type-ahead and topic counts already exist on the website and need exposing on `/v1`; phone-OTP needs an SMS vendor the platform does not have. Not launch blockers. |

### App work that is waiting on the above

- Point the release build at the production API and website. **Nothing currently
  prevents shipping a localhost build** — the in-app assert is compiled out of
  release, and CI warns and then builds and uploads the bundle anyway.
- Make Terms and Privacy tappable (needs the URLs).
- **Google sign-in is not a config flip.** It needs the SDK, a token exchange, a
  second session mechanism (the mobile endpoint returns tokens in the body while
  the app is entirely cookie-based), plus `GOOGLE_MOBILE_CLIENT_IDS` set on the
  server. And **enabling it on iOS makes Sign in with Apple mandatory** under
  guideline 4.8 — which the app does not have at all.
- iOS privacy manifest (`PrivacyInfo.xcprivacy`), required by Apple since 2024.
- CI: **it cannot run anywhere today.** The app repo has no remote, and on GitHub
  the app exists only as a subdirectory of the website monorepo's snapshot
  branch, where Actions never looks. It needs its own repository first.

---

## Two things about this repository

- **All of this work sits on the `feature/auth` branch of a local repo.** The
  app's own `main` and `develop` are far behind. Anyone building from the default
  branch gets the app as it was before this work. The only copy on GitHub is
  inside the website monorepo's `app/cq-mobile` branch.
- **`README.md` advertises features that do not exist** — push notifications
  among them. There is no push implementation of any kind. It should be corrected
  before the repo is handed to anyone.

---

## The order to unblock in

1. **Deploy the API to a public HTTPS host, with Elasticsearch indexed and email
   actually sending.** These three travel together; any one missing leaves a
   launch that looks fine and fails for real users.
2. **Publish the privacy policy, terms, and web deletion pages.**
3. **Create the release keystore**, then the Play Console account.
4. **Reboot this machine**, produce the first signed `.aab` with production URLs,
   and run it on a real device against the real API. **This is the first genuine
   end-to-end check the project will have had**, and it should happen before
   anything is submitted.
5. **Apple Developer account and a Mac**, if iOS is in scope. Android can ship
   without any of it.

---

## Honest summary

The app's code is in a state I would be comfortable submitting **once the app has
been seen working on a phone against a real server, which has never happened.**

What stops submission is not app code: a deployed API with search and email, four
published web pages, one signing key, two console accounts, a demo login, and —
for iOS only — a Mac.

Android is realistically **weeks, not days**, from submission: item 1 alone is a
first-time deployment of an API, a search cluster and an email provider, none of
which has a pipeline today.

---

## What the first draft of this document got wrong

Re-checked against the code, five claims did not hold:

| Claimed | Actually |
|---|---|
| 27 tests before | 9 |
| 4 of 20 repositories had tests | 0 of the 6 that existed |
| "the screens themselves" now covered | 7 of 21, at 40% line coverage overall |
| The failed-refresh bug was fixed | Fixed on 2 of 8 screens; the rest were fixed after this recheck |
| Five dead sign-in controls, all hidden | Six. The sixth was live in a default build until this recheck |
| "Feature-complete against the website" | Core journeys yes; résumé viewing and both social sign-ins have no working app equivalent |

It also omitted email delivery, Elasticsearch, the demo account, R2, `TRUST_PROXY`
and résumé scanning — several of which are launch blockers.

---

*Detail is in `TRACKER.xlsx` in this folder: 65 rows, 31 closed, 33 open, of which
14 belong to the website developer or the owner. Some early fixes above pre-date
the tracker and have no row. Privacy form answers are in `DATA_SAFETY.md`.*
