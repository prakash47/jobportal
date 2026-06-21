-- Onboarding "Employment & Professional" step (SRS §4.3).
-- Additive + non-destructive: three new enum types, five new nullable columns on
-- Candidate, an isCustom flag on Skill, and two new tables (Project,
-- CandidateLanguage). Existing rows are unaffected (new columns are nullable;
-- Skill.isCustom backfills to false).

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('FRESHER', 'EXPERIENCED');

-- CreateEnum
CREATE TYPE "LookingFor" AS ENUM ('JOB', 'INTERNSHIP', 'BOTH');

-- CreateEnum
CREATE TYPE "LanguageProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "Candidate"
  ADD COLUMN "workStatus" "WorkStatus",
  ADD COLUMN "lookingFor" "LookingFor",
  ADD COLUMN "currentCompanyName" TEXT,
  ADD COLUMN "currentCityName" TEXT,
  ADD COLUMN "industryId" INTEGER;

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLanguage" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "proficiency" "LanguageProficiency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_industryId_idx" ON "Candidate"("industryId");

-- CreateIndex
CREATE INDEX "Project_candidateId_idx" ON "Project"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateLanguage_candidateId_idx" ON "CandidateLanguage"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateLanguage_candidateId_name_key" ON "CandidateLanguage"("candidateId", "name");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateLanguage" ADD CONSTRAINT "CandidateLanguage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
