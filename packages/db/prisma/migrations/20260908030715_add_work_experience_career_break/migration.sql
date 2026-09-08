-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "WorkExperience" ADD COLUMN     "isCareerBreak" BOOLEAN NOT NULL DEFAULT false;
