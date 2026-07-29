-- Password reset reworked from an emailed LINK to a 6-digit OTP (SRS §4.12.5).
--
-- Existing rows are DELETED rather than migrated. Every row in this table is an
-- ephemeral (15-minute) link token, and a link token cannot be carried into the
-- OTP flow: it has no code to verify, and `codeHash` below is NOT NULL. The
-- practical effect is that any reset link already in flight stops working —
-- which is the correct outcome of retiring the link flow, and the user simply
-- requests a code instead.
DELETE FROM "PasswordResetToken";

-- The hashed 6-digit code. Salted with the userId by the service, so two users
-- issued the same digits do not collide.
ALTER TABLE "PasswordResetToken" ADD COLUMN "codeHash" TEXT NOT NULL;

-- `tokenHash` is now the one-time ticket minted AFTER the code is verified, so
-- it does not exist for the whole first leg of the flow.
ALTER TABLE "PasswordResetToken" ALTER COLUMN "tokenHash" DROP NOT NULL;

-- Brute-force + abuse counters. These are the real control on a 10^6 code
-- space; the per-IP throttler bounds one source, not a proxy pool.
ALTER TABLE "PasswordResetToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PasswordResetToken" ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PasswordResetToken" ADD COLUMN "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PasswordResetToken" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Exactly one live reset per user: a resend REPLACES the code in place, so N
-- resends can never leave N simultaneously-valid codes standing.
DROP INDEX "PasswordResetToken_userId_idx";
CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");

-- Purge sweep support: WHERE "expiresAt" < now.
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
