# ADR 0002 — Plaintext signup OTPs, relayed by staff

- **Status**: Accepted
- **Date**: 2026-07-29
- **Branch**: `feature/recruiter-signup-otp-verification`
- **Decided by**: Prakash (owner)

> ⚠️ `/docs/` is gitignored, so this file is LOCAL-ONLY and does not reach the
> other developers. The authoritative, shared copy of this decision is the
> `feature/recruiter-signup-otp-verification` entry in `PROGRESS.md`.

## Context

Recruiter signup now requires proving both an email address and an Indian
mobile number by one-time code before the account is created. No SMS gateway
and no transactional-email path for signup codes is wired, and none is planned
for this phase. The chosen delivery mechanism is a human one: a Career Queue
staff member reads the code off `/sadmin/otp-sessions` and relays it to the
registrant by phone or WhatsApp.

## Decision

Store `OtpChallenge.code` in **plaintext**.

This knowingly departs from a rule the schema otherwise states three times —
`Session.refreshTokenHash`, `PasswordResetToken.tokenHash` and
`RecruiterInvite.tokenHash` are all `sha256(raw)` because the raw value reaches
the user out of band. Here it does not, so a hash would make the feature
impossible.

## Consequences accepted

1. **The OTP table is a standing credential store.** Mitigated by a 15-minute
   TTL, deletion of both rows inside the register transaction the moment a
   signup succeeds, and an hourly BullMQ purge of anything expired.
2. **Staff can self-serve a code for a contact they do not own**, register as
   that company, and — because the company slug becomes taken — permanently
   block the real business from self-registering. This cannot be engineered
   away: seeing the credential *is* the job. Moved from prevention to
   detection: every reveal writes a `ProfileAuditAction.OTP_CODE_REVEALED` row
   against the revealing admin, with the code excluded from the diff.
3. **Relay staff necessarily hold full `ADMIN`.** `UserRole` has exactly three
   members and `AdminGuard` is a flat role check, so the same people can toggle
   platform killswitches and approve KYC. Accepted for now; a `SUPPORT` role
   below `ADMIN` was considered and deferred as too large for this branch.
4. **Process risk, not a code risk**: staff must only ever call *out* to the
   number on the challenge row, never read a code to an inbound caller. An
   unregistered person cannot be authenticated, so an inbound "what's my code?"
   is a textbook vishing setup. This belongs in the support runbook.

## Revisit when

A real SMS/email provider is wired. At that point `code` becomes a hash, the
sadmin page loses its code columns, and consequences 1, 2 and 4 mostly
evaporate.
