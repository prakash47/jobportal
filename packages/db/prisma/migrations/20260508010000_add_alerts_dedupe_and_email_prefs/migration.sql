-- SRS §4.5 — JobAlert dedupe state + one-click unsubscribe token + new
-- EmailPreference table (foundation for SRS §4.13.4). No live JobAlert rows
-- yet, so adding NOT NULL columns is safe.

-- AlterTable: JobAlert
ALTER TABLE "JobAlert"
  ADD COLUMN "lastSentJobIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "lastSentAt" TIMESTAMP(3),
  ADD COLUMN "unsubscribeToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_unsubscribeToken_key" ON "JobAlert"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "JobAlert_frequency_isActive_idx" ON "JobAlert"("frequency", "isActive");

-- CreateTable
CREATE TABLE "EmailPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "applicationStatusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "productNewsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailPreference_userId_key" ON "EmailPreference"("userId");

-- AddForeignKey
ALTER TABLE "EmailPreference" ADD CONSTRAINT "EmailPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
