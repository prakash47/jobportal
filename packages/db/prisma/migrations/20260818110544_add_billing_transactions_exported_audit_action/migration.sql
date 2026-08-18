-- AlterEnum
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_TRANSACTIONS_EXPORTED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE INDEX "PaymentOrder_createdAt_idx" ON "PaymentOrder"("createdAt" DESC);
