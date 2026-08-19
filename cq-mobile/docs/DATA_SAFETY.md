# Store privacy disclosures — prepared answers

Both consoles ask the same questions in different words. This is what the app
**actually does**, read out of the code on 20 Aug 2026, so the forms can be
filled from evidence rather than memory. Every claim below names the file it
came from.

Getting these wrong is not a formality: a disclosure that does not match
observed behaviour is grounds for rejection, and later for removal.

> **Three answers are NOT mine to give.** They are marked **OWNER DECISION**
> and are about what the *business* does with the data once the server has it —
> retention, and who else sees it. Nothing in the app can tell you those.

---

## 1. Does the app collect or share user data?

**Yes.** The app is an account-based job-search product; a candidate builds a
profile and applies to jobs with it.

Browsing works signed-out — jobs, companies and career advice are public. Data
collection begins at registration.

---

## 2. What is collected

Everything here is typed or chosen by the candidate. The app reads no contacts,
no calendar, no photos, no device location, and no advertising identifier.

| Data | Play category | Apple label | Required? | Evidence |
|---|---|---|---|---|
| Name | Personal info › Name | Contact Info › Name | Required to register | `auth_repository.dart` register body |
| Email address | Personal info › Email address | Contact Info › Email Address | Required to register | same |
| Phone number | Personal info › Phone number | Contact Info › Phone Number | Optional | `RegisterDto.phone` is `.optional()`; the app omits the key when blank |
| Gender | Personal info › Other info | Sensitive Info | Optional | onboarding step 3, `gender` |
| Headline, summary | Personal info › Other info | User Content › Other | Optional | profile editor |
| Current / expected salary | Personal info › Other info | Other Data | Optional | `salary_input.dart` — LPA, stored as paise |
| Work history, education, projects, languages, skills | Personal info › Other info | User Content › Other | Optional | the profile editors |
| Preferred cities, notice period, work status | Personal info › Other info | Other Data | Optional | profile editor |
| **Résumé file** (PDF/DOC/DOCX) | **Files and docs** | **User Content › Other** | Required to apply | `resume_section.dart` uses `FileType.custom`, extensions `pdf, doc, docx` |
| Applications, saved jobs, job alerts | App activity › Other user-generated content | Other Data | Follows from use | `applications_repository.dart`, `saved_jobs_repository.dart`, `alerts_repository.dart` |
| Account id + session cookies | — (not sent off-device by the app) | Identifiers › User ID | Automatic | `secure_cookie_storage.dart`, `session_cache.dart` |

### Not collected — say "no" to these
- **Device or precise/approximate location.** The app declares **no** location
  permission and calls no location API. "Preferred city" is a name the candidate
  picks from a list; it is a preference, not a device reading.
- **Contacts, calendar, photos, camera, microphone, SMS, call logs.** The merged
  release manifest declares exactly one permission: `INTERNET`.
- **Advertising ID, device identifiers, installed apps.**
- **Crash logs, diagnostics, performance data.** No crash or analytics SDK is
  linked — verified against `pubspec.yaml`. (If Sentry or PostHog is added later,
  this section must be revised **before** that build ships.)
- **Payment or financial information.** There is no purchase flow in the app.
  Salary figures are profile preferences, not financial instruments.

> **iOS note.** `file_picker`'s header links Photos and MediaPlayer
> unconditionally, so `Info.plist` carries `NSPhotoLibraryUsageDescription` and
> `NSAppleMusicUsageDescription`. The app **never opens either library** — a
> résumé is chosen through the Files document picker. Do **not** let those two
> strings lead you to declare photo or media collection.

---

## 3. Is data shared with third parties?

**OWNER DECISION — and the most likely one to be answered wrongly.**

The app itself shares nothing: no analytics, no ad network, no third-party SDK
receives any of it. Every byte goes to CQ's own API over HTTPS.

But **applying sends the candidate's profile and résumé to the recruiter**, and
a recruiter is a different organisation. Both consoles treat that as a transfer
you must disclose. Decide, with whoever owns the policy:

- whether that is disclosed as sharing (it usually is), and
- what a recruiter can see, and for how long.

The app cannot answer this. The behaviour lives in the backend and in the
contract with employers.

---

## 4. Security practices

| Question | Answer | Evidence |
|---|---|---|
| Encrypted in transit? | **Yes** | `network_security_config.xml` sets `base-config cleartextTrafficPermitted="false"`. The only cleartext exception is a `domain-config` scoped to `127.0.0.1`, `localhost` and `10.0.2.2` — loopback, for local development; that traffic never leaves the device. The permissive config is confined to the debug variant. |
| Session material at rest | Keystore-backed | Cookies and the cached identity go through `flutter_secure_storage` (EncryptedSharedPreferences on Android, Keychain on iOS) — `secure_cookie_storage.dart` |
| Excluded from OS backup? | **Yes** | `allowBackup=false` and `dataExtractionRules` in the manifest, so session material is not copied to the user's cloud backup |
| Can a user request deletion? | **Yes, in-app** | Settings › Danger zone, typed "DELETE" confirmation → `DELETE /v1/me/account` (`settings_repository.dart`). This satisfies Google's in-app deletion requirement and Apple 5.1.1(v). |
| Deletion also reachable from the web? | **NO — OUTSTANDING** | Play additionally wants a **web URL** where deletion can be requested without installing the app. That page does not exist. Website work. |
| Data collection optional? | Partly | Browsing needs no account. An account is required to apply, save jobs, or set alerts. |

---

## 5. Still blocking the forms

These cannot be answered from the app, and the forms cannot be submitted without
them:

1. **A published privacy policy URL.** Both consoles require it. No such page
   exists yet, on the website or anywhere else. — *website + owner*
2. **A web-based account-deletion URL.** Play requires it in addition to the
   in-app path that already works. — *website*
3. **Retention periods.** How long an account, a résumé, and an application are
   kept after deletion. — **OWNER DECISION**
4. **The sharing answer in §3.** — **OWNER DECISION**

---

## 6. Content rating questionnaire

Answer **no** to every content category — violence, sexual content, drugs,
gambling, profanity. The app shows job listings, company pages and careers
articles.

Two that need a real answer rather than a reflex:

- **User-generated content?** **Yes.** Recruiters write job descriptions and
  company profiles; the app renders them. That normally requires a way to report
  content, which the app has — "Report this job" posts to `POST /v1/reports`
  (`report_job_sheet.dart`), added for exactly this reason.
- **Does the app share the user's location with other users?** **No.**

---

*Compiled from the code on 20 Aug 2026. Anything marked OWNER DECISION or
website work is outside the app and is tracked in `TRACKER.xlsx`.*
