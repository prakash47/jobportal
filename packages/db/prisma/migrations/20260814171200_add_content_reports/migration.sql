-- CreateEnum
CREATE TYPE "ContentReportTargetType" AS ENUM ('JOB');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('FAKE_OR_SCAM', 'MISLEADING', 'DISCRIMINATORY', 'OFFENSIVE', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'CONTENT_REPORT_ACTIONED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'CONTENT_REPORT_DISMISSED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" SERIAL NOT NULL,
    "targetType" "ContentReportTargetType" NOT NULL,
    "jobId" INTEGER,
    "reason" "ContentReportReason" NOT NULL,
    "details" TEXT,
    "reporterId" INTEGER,
    "reporterIp" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_jobId_status_idx" ON "ContentReport"("jobId", "status");

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
