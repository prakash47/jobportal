-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "postQuotaConsumed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE INDEX "Job_status_submittedForReviewAt_idx" ON "Job"("status", "submittedForReviewAt");
