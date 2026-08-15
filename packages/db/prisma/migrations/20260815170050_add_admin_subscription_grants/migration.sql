-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_GRANTED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_PLAN_CHANGED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_EXTENDED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_CANCELLED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "grantNote" TEXT,
ADD COLUMN     "grantedAt" TIMESTAMP(3),
ADD COLUMN     "grantedById" INTEGER;
