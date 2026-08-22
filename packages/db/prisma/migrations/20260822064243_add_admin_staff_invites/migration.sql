-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_INVITED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_INVITE_RESENT';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_INVITE_REVOKED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_INVITE_ACCEPTED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_ROLE_CHANGED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_PERMISSIONS_CHANGED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_DEACTIVATED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'ADMIN_STAFF_REACTIVATED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "AdminStaffInvite" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "staffRole" "AdminStaffRole" NOT NULL,
    "permissions" JSONB,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminStaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminStaffInvite_tokenHash_key" ON "AdminStaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminStaffInvite_email_idx" ON "AdminStaffInvite"("email");
