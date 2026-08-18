-- AlterEnum
ALTER TYPE "ProfileAuditAction" ADD VALUE 'JOB_CLOSED_BY_ADMIN';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;
