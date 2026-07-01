-- AlterEnum
ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_PASSWORD_CHANGE';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;
