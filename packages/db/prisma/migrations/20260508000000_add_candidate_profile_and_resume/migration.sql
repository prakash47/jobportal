-- SRS §4.3 — candidate profile + resume models.
-- Drops experienceYears (replaced by experienceMonths) and resumeUrl (replaced
-- by Resume row + Candidate.activeResumeId). No live data yet, so destructive
-- column drops are safe.

-- CreateEnum
CREATE TYPE "ResumeScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "ProfileAuditAction" AS ENUM (
  'PROFILE_UPDATE',
  'EDUCATION_ADD',
  'EDUCATION_UPDATE',
  'EDUCATION_DELETE',
  'EXPERIENCE_ADD',
  'EXPERIENCE_UPDATE',
  'EXPERIENCE_DELETE',
  'SKILLS_UPDATE',
  'RESUME_UPLOAD',
  'RESUME_DELETE'
);

-- AlterTable: drop old columns, add new ones
ALTER TABLE "Candidate"
  DROP COLUMN "experienceYears",
  DROP COLUMN "resumeUrl",
  ADD COLUMN "experienceMonths" INTEGER,
  ADD COLUMN "currentTitle" TEXT,
  ADD COLUMN "expectedSalaryMinPaise" INTEGER,
  ADD COLUMN "expectedSalaryMaxPaise" INTEGER,
  ADD COLUMN "noticePeriodDays" INTEGER,
  ADD COLUMN "preferredCityIds" INTEGER[],
  ADD COLUMN "activeResumeId" INTEGER,
  ADD COLUMN "profileCompleteness" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Education" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "institute" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER,
    "grade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkExperience" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "scanStatus" "ResumeScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" "ProfileAuditAction" NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_activeResumeId_key" ON "Candidate"("activeResumeId");

-- CreateIndex
CREATE INDEX "Education_candidateId_idx" ON "Education"("candidateId");

-- CreateIndex
CREATE INDEX "WorkExperience_candidateId_idx" ON "WorkExperience"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_r2Key_key" ON "Resume"("r2Key");

-- CreateIndex
CREATE INDEX "Resume_candidateId_deletedAt_idx" ON "Resume"("candidateId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProfileAuditLog_userId_createdAt_idx" ON "ProfileAuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_activeResumeId_fkey" FOREIGN KEY ("activeResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkExperience" ADD CONSTRAINT "WorkExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAuditLog" ADD CONSTRAINT "ProfileAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
