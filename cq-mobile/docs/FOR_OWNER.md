# CQ Mobile — what only you can provide

**22 August 2026**

The app is code-complete for the job-seeker journey: 593 automated tests,
analyzer clean, 73% line coverage, everything pushed. **It cannot be published,
and none of the remaining work is app development.**

This page is the part that needs you: accounts, money, a signing key, a Mac, and
four decisions. The engineering half is in `FOR_WEBSITE_DEV.md`.

---

## The honest headline

Two things are true at once:

1. The app's code is in a state I would be comfortable submitting.
2. **The app has never run on a phone against a real server.** Not once, by
   anyone. Everything reported here is verified by tests and by reading the code
   — a strong foundation, and not the same thing as having seen it work.

Closing that gap needs one item from you (below) and one from the website
developer, and it should happen before anything is submitted anywhere.

---

## Costs, so there are no surprises

| | Cost | Needed for |
|---|---|---|
| Google Play Console | **$25**, one time | Android |
| Apple Developer Program | **$99 / year** | iOS |
| A Mac | Hardware, or ~$20–50/mo cloud | iOS only |
| Resend (email) | Free tier likely enough to start | **Both** — see below |
| Hosting (API + Postgres + Elasticsearch + R2) | Ongoing | **Both** |

Android can ship without the Mac and without the Apple account. iOS cannot start
without both.

---

## 1. Android release keystore — do this first

Every release build today is signed with the **debug certificate**. Play rejects
that outright.

You need to create a keystore and keep it safe. This is the single most
dangerous item on the page:

> **If this file or its password is lost, you can never update the app again.**
> Not "it is difficult" — Play identifies an app by its signing key, and a new
> key means a new listing with zero installs and zero reviews.

Store it somewhere you will still have in three years, with the password, and
**not only on this laptop**. Once it exists I will wire it into the build.

It also unblocks Google sign-in: the OAuth client needs this key's SHA-1
fingerprint.

---

## 2. A Mac — for iOS only

There is no workaround. iOS cannot be built, archived or submitted without macOS.
The project has **never been built for iOS at all** — no CocoaPods setup, no
signing identity.

Options, cheapest first:

- **Skip iOS for now.** Android ships without any of this. Genuinely reasonable
  for a first release in India, where Android share is very high.
- **Rent a cloud Mac** (MacStadium, Scaleway) for the build and submission
  window only.
- **Buy one.** Only worth it if iOS is a long-term commitment.

I can prepare everything that does not need macOS — the Podfile, the privacy
manifest, the icon variants — but none of it can be *verified* until a Mac
exists, and I would rather not report untested work as done.

---

## 3. Store accounts

- **Google Play Console** ($25). Note Google now requires most new personal
  developer accounts to test with 12 users for 14 days before production access —
  worth starting the account early even if the build is not ready, because that
  clock runs in the background.
- **Apple Developer Program** ($99/yr) — only if iOS is in scope.

---

## 4. A demo account for the reviewers

**Nothing in the app works without signing in.** The router sends every content
route to the welcome screen when signed out — a reviewer with no credentials sees
a welcome screen and nothing else.

Apple's guideline 2.1 requires working demo credentials for anything behind a
sign-in wall, and Play asks the same. So: one real account on the production
system, already email-verified, with a résumé uploaded and a couple of
applications on it so the reviewer can see the app actually doing something.

This cannot be created until the API is deployed and email works.

---

## 5. Store listing assets

For each store: screenshots at the required sizes, a short and full description,
a category, a content rating questionnaire, and a feature graphic for Play. I can
generate screenshots from a real device once there is a working build.

---

## 6. Legal pages — you are the blocker here, not the developer

Both stores require a **public privacy policy URL** before a listing can be
submitted. Neither page exists, and this is deliberately waiting on you:

- **Privacy policy** — needs your legal entity name, registered address, contact
  email, and your data-retention decision.
- **Terms of service** — the app already tells users, in two places, that they
  have agreed to terms. **That text currently points at nothing.**

The website developer can build both pages in about half a day *once the text
exists*. Until then this blocks: their work, my ability to make the app's own
Terms/Privacy text tappable, and both store submissions.

If budget is tight, a lawyer-reviewed template is usually enough to start — but
it does need to be truthful about what the platform actually does, and
`DATA_SAFETY.md` in this folder documents exactly that.

---

## 7. Four decisions I need from you

### a. Two privacy answers

`DATA_SAFETY.md` has every console answer prepared except two, because both are
business decisions rather than technical facts:

1. **How long is data kept after a user deletes their account?** Note the backend
   already documents that deletion is *not* full erasure — a recruiter's
   notification row keeps a rendered copy of the candidate's name. The forms must
   say so accurately.
2. **Is sending a candidate's profile and résumé to a recruiter declared as
   sharing with a third party?** It is a defensible "no" (the recruiter is a user
   of the same platform, and it is the point of the product) and a defensible
   "yes". Pick one and be consistent across both stores.

### b. Where does the app's code live on GitHub?

Right now the app has **no repository of its own**. Its only hosted copy is the
`app/cq-mobile` branch inside the website monorepo. That placement is also why no
automated build can run: GitHub Actions only reads workflows at a repository
root.

I recommend giving the app its own repo under your account. Its CI then runs
unchanged, it gets its own release history for Play, and it can be shared with a
reviewer without granting backend access.

### c. iOS now, or Android first?

Answering this decides whether items 2 and 3 are urgent or can wait months.

### d. Google / Apple sign-in — in the first release or not?

Both are built in the app and hidden behind a flag. Turning them on needs OAuth
clients created in the Google and Apple consoles (~1h of your time), and one
warning worth knowing: **on iOS, offering Google sign-in makes Sign in with Apple
mandatory** under Apple's guideline 4.8 — and Apple sign-in is not implemented in
the app at all. Shipping email-only sign-in first is simpler and entirely
acceptable.

---

## 8. What moved since the first version of this page

**Email now works.** That was the biggest blocker on the list and the website
developer has closed it — delivery is proven end to end. The alerts problem this
section used to warn about is gone with it.

One caveat to carry into the deploy, not a reason to worry now: the key lives on
their machine, and the "from" address still defaults to one that only reaches
their own inbox. Both need setting on the real host before a tester or a store
reviewer can receive anything. It is on their page.

**The app's registration was broken and is fixed.** Their signup work started
requiring a verified email code before an account can exist, and the app was
still registering the old way — so every signup in the app failed. The app now
does the same two-step flow, which also closes a hole on our side: until today
someone could create an account through the app without proving they owned the
address.

---

## The order I would go in

1. **Reboot this laptop.** The build toolchain has a machine-level fault and
   cannot produce an APK. Free, five minutes, and it unblocks the first real
   device test.
2. **Create the keystore.** Free, ten minutes, unblocks Play and Google sign-in.
3. **Write or commission the privacy policy and terms text.** This has the
   longest lead time and blocks other people.
4. **Open the Play Console account** ($25) — the testing clock starts running.
5. Meanwhile the website developer deploys the API with email and search.
6. **Then** the first signed build on a real device against the real server — the
   check this project has never had.
7. Apple account and a Mac, only if iOS is in scope.

Items 1–4 are yours, cost $25, and none of them wait on anybody else.

---

## What is already done, so you can judge the rest

| | |
|---|---|
| Seeker features | Complete — search, apply, save, alerts, applications, profile, résumé, companies, articles, account deletion |
| Automated tests | 593, all passing |
| Analyzer warnings | 0 |
| Line coverage | 73% |
| Security review | Session storage, logout, cloud backup, credential logging — all closed |
| Store compliance | Six dead sign-in buttons removed, iOS metadata corrected, large-text clipping fixed, in-app deletion built |
| Known defects | None outstanding on the app side |

---

*`PUBLISHING_READINESS.md` is the full technical picture, `TRACKER.xlsx` the
item-by-item list, `DATA_SAFETY.md` the prepared privacy-form answers, and
`FOR_WEBSITE_DEV.md` the engineering half of this handoff.*
