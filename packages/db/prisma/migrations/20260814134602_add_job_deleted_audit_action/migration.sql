-- AlterEnum
ALTER TYPE "ProfileAuditAction" ADD VALUE 'JOB_DELETED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;
