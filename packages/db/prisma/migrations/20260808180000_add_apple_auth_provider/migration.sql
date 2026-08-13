-- Sign in with Apple for the mobile app.
--
-- Apple is not optional: App Store Review Guideline 4.8 requires it on iOS as
-- soon as any third-party social login ships, so it lands alongside the Google
-- mobile endpoint rather than after it.
--
-- Additive only. No column is dropped, nothing is backfilled, and every
-- existing row is untouched: `appleId` is nullable and only ever set when
-- someone actually signs in with Apple.

-- Verified on this project's Postgres 18 before committing: ALTER TYPE ... ADD
-- VALUE runs fine inside a transaction block. The old "cannot run inside a
-- transaction" rule was lifted in Postgres 12; what remains is that the NEW
-- value cannot be USED in the same transaction that adds it. Nothing below
-- writes 'APPLE', so this is safe as a single migration.
ALTER TYPE "AuthProvider" ADD VALUE 'APPLE';

-- Apple's stable `sub` claim. A SEPARATE column from googleId rather than a
-- shared providerId, because one account can legitimately carry both: someone
-- who signed up with Google on the web and later used Apple on their phone has
-- to land on the SAME account, and a single shared column could only record
-- whichever provider was seen last.
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;

-- Unique so a given Apple identity maps to exactly one account, and so a
-- concurrent double sign-in loses the race with P2002 instead of creating two
-- accounts for one person. Postgres treats NULLs as distinct, so every
-- non-Apple user remains unaffected.
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
