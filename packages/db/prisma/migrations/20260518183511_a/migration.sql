-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;
