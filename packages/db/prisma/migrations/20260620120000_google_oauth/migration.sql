-- Google OAuth support (SRS §4.12.6, pulled into Phase 1 per ADR 0001).
-- Additive + non-destructive: existing rows backfill provider='LOCAL' via the
-- column default; passwordHash becomes nullable for OAuth-only accounts.

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
