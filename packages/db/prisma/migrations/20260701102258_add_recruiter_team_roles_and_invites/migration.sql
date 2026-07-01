-- CreateEnum
CREATE TYPE "RecruiterRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_USER_INVITED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_INVITE_REVOKED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_INVITE_ACCEPTED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_USER_ROLE_CHANGED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_USER_PERMISSIONS_CHANGED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_USER_REMOVED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Recruiter" ADD COLUMN     "companyRole" "RecruiterRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "RecruiterInvite" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "companyRole" "RecruiterRole" NOT NULL DEFAULT 'MEMBER',
    "permissions" JSONB,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterInvite_tokenHash_key" ON "RecruiterInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "RecruiterInvite_companyId_idx" ON "RecruiterInvite"("companyId");

-- CreateIndex
CREATE INDEX "RecruiterInvite_companyId_email_idx" ON "RecruiterInvite"("companyId", "email");

-- CreateIndex
CREATE INDEX "Recruiter_companyId_deactivatedAt_idx" ON "Recruiter"("companyId", "deactivatedAt");

-- AddForeignKey
ALTER TABLE "RecruiterInvite" ADD CONSTRAINT "RecruiterInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (data migration): give every existing company exactly one OWNER.
-- The just-added companyRole column defaulted every recruiter to MEMBER; promote
-- the earliest-joined recruiter (by createdAt, then id as a deterministic
-- tiebreak) in each company to OWNER. RecruiterRole was created via CREATE TYPE
-- above, so 'OWNER' is usable within this same migration. Companies created after
-- this migration get their OWNER at registration time (the creator), in app code.
UPDATE "Recruiter" AS r
SET "companyRole" = 'OWNER'
WHERE r.id IN (
    SELECT DISTINCT ON ("companyId") id
    FROM "Recruiter"
    ORDER BY "companyId", "createdAt" ASC, id ASC
);
