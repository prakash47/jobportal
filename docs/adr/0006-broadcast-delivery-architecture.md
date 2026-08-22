# ADR 0006 — Broadcast delivery: a dedicated queue, one job per recipient, and a Postgres ledger

- **Status**: Accepted
- **Date**: 2026-08-19
- **Branch**: `feature/sadmin-broadcast-notifications`
- **Supersedes / relates to**: nothing. This is the first admin→user outbound email in the product.

> ⚠ **This file is not visible to the rest of the team.** `.gitignore:170` excludes `/docs/`
> entirely, so no ADR in this directory has ever been pushed — which is why a comment in three
> middleware files cites "ADR 0005" that does not exist in a fresh clone. The load-bearing parts of
> this decision are therefore ALSO recorded in `PROGRESS.md`, which is tracked. Fixing the
> gitignore is out of scope here and is logged as a follow-up.

## Context

The Broadcast Notifications console lets a platform admin send one message to every recruiter or
every job seeker. Before this branch the repo had:

- a `transactional-emails` BullMQ queue whose worker runs at **BullMQ's default concurrency of 1
  with no `limiter`**, and which deliberately uses **random job ids** so two genuine password
  resets are never collapsed;
- exactly one many-recipient fan-out (`AlertsProcessor.scanFrequency`), an unbounded `findMany`
  plus a sequential `for` loop inside a single job, whose own comment concedes it does not scale;
- **no** batching helper, **no** rate limiting anywhere, **no** per-email persistence of any kind,
  and **no** deployment manifest defining how workers run;
- crucially, **`app.enableShutdownHooks()` is never called** — verified by a repo-wide grep. Every
  queue service implements `OnApplicationShutdown`, and none of those hooks ever fires. A deploy
  kills in-flight jobs mid-execution and BullMQ re-runs them after the stall timeout.

A broadcast differs from everything else in this codebase in one specific way: **its damage keeps
accumulating after the request that started it has returned, and it cannot be undone.** Every other
admin action is bounded by one row and reversible by a later admin action.

## Decision

### 1. A dedicated `broadcasts` queue, not the `transactional-emails` queue

Reusing the existing queue would mean a campaign is delivered strictly one email at a time **and**
head-of-line blocks every password reset, verification code and apply confirmation behind it. The
existing queue's design is correct for its own traffic and wrong for this; the two need different
concurrency, a different retry curve, and a rate limiter that the transactional queue does not want.

Consequence: `ResendClient` is provided directly in `AdminBroadcastsModule` rather than reached
through `EmailModule` (whose only export is `EmailService`, and whose every method enqueues onto the
queue we are avoiding). This escapes the `killswitch.transactional_emails` check that lives inside
the transactional processor — exactly as `sendJobAlert` already does — so **the broadcast worker
checks that flag explicitly** alongside its own.

### 2. One delivery job per recipient, not per batch

BullMQ's `limiter` throttles **jobs**, not work inside a job. A batch job looping over 200 addresses
is entirely unthrottled from the queue's point of view, and Resend's default allowance is about 2
requests/second. Per-recipient jobs also make `attempts`/`backoff` apply per address: in a batch
job, one bad address fails the batch and the retry re-sends the 199 that already succeeded.

Cost: one Redis entry and two indexed reads per recipient. At the limiter's pace that is not close
to the bottleneck.

### 3. A Postgres ledger (`BroadcastRecipient`) with `@@unique([broadcastId, userId])`

This is the safety mechanism of the whole feature. Because shutdown hooks never fire, a deploy
during a send is not an edge case — it is the normal case. Without a per-(broadcast, recipient) key
for a re-run to collide with, a redeploy mid-send re-mails everyone already reached.

The ledger is also the only way to answer "did we email this person", which no table in this schema
could answer before. `userId` is a **loose id with no FK** and `email` is snapshotted, so the record
survives the recipient deleting their account — a ledger that vanishes with its subject cannot do
its job.

### 4. Send first, mark second (at-least-once)

The alternative — claim the row, then send — is at-most-once, and a crash in the window loses that
email silently. This way the same crash re-sends **one** email on retry. For an operational notice a
duplicate is an annoyance and a silent miss is the actual failure. Blast radius of a crash is one
recipient either way.

### 5. No advisory lock on dispatch

`allocateInvoiceNumber` next door uses `pg_advisory_xact_lock` because it READS a maximum and then
WRITES a value derived from it — a race a single statement cannot close. Dispatch has no such
read-then-write: the guard is one conditional `UPDATE ... WHERE id = ? AND status = 'DRAFT'`, which
Postgres already serialises. Of two admins pressing Send simultaneously, exactly one gets
`count === 1`. A lock around an already-atomic primitive would add only a way to deadlock.

### 6. The killswitch is re-read before every recipient

Every other `killswitch.*` in this repo gates a request that completes and returns, so reading it
once is reading it at the only moment that matters. Here a switch read only at dispatch could not
stop the situation it exists for. A halt is recorded as a **cancellation** (there is no resume in
v1, so leaving the row `SENDING` with thousands of `PENDING` recipients would be a state nothing
could move out of), and writes **no audit row** — there is no acting admin, and `FlagAuditLog`
already records the operator who threw the switch, with their reason.

## Consequences

**Good.** A send is resumable, non-duplicating across restarts, rate-limited, individually
retryable, stoppable mid-flight, and fully accounted for per recipient. None of those properties
existed in this codebase before.

**Costs and things now owed.**

- A fifth copy of the Redis connection helper exists — deliberately **not** a copy: the other four
  read only `hostname` and `port` from `REDIS_URL` and silently drop username, password, db index
  and `rediss://` TLS. Ours parses the whole URL. Fixing the other four is a follow-up.
- No dead-letter queue: terminal failures land on the recipient row instead, which is the surface
  the console actually reads. (The transactional DLQ's own re-drive script does not exist.)
- No resume for a killswitch-halted broadcast; composing a fresh one is the path.
- Workers still run in-process. Splitting them out needs a deployment manifest the repo has never
  had, and would be the first such change.
- Promotional sends are refused at the API. The consent rails they need — `productNewsEnabled`
  actually gating a send, a recruiter-facing opt-out surface, a token unsubscribe and a
  `List-Unsubscribe` header — are all absent and are their own piece of work.

## Alternatives rejected

- **Reuse `transactional-emails`.** Rejected: concurrency 1, no limiter, random job ids by design,
  and head-of-line blocking of security-critical mail.
- **Batch jobs of N recipients.** Rejected: defeats the rate limiter and makes retries re-send.
- **BullMQ state as the source of truth.** Rejected: nothing in the app can observe a queue (no
  `QueueEvents`, no `getJob()`, no progress reporting anywhere), and the existing DLQ's own comment
  argues against mirroring queue internals into Postgres. The ledger records the *broadcast*, not
  the queue.
- **An `internal`-style boolean instead of a ledger** (i.e. just counters on `Broadcast`). Rejected:
  counters cannot make a restart idempotent, and cannot answer "did this person get it".
