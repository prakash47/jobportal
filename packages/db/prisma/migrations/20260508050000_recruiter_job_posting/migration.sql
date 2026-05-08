-- SRS §4.9.3-7 — recruiter job posting + applicant management.

-- Add PENDING_MODERATION to JobStatus.
ALTER TYPE "JobStatus" ADD VALUE 'PENDING_MODERATION' BEFORE 'ACTIVE';

-- New enums
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN');
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- Job: recruiter ownership + employment type + work mode.
ALTER TABLE "Job"
  ADD COLUMN "postedById" INTEGER,
  ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN "workMode" "WorkMode" NOT NULL DEFAULT 'ONSITE';

-- FK: recruiter departure must NOT cascade-delete jobs (admin reassigns).
ALTER TABLE "Job"
  ADD CONSTRAINT "Job_postedById_fkey" FOREIGN KEY ("postedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Job_postedById_status_idx" ON "Job"("postedById", "status");

-- Application: per-applicant recruiter notes.
ALTER TABLE "Application" ADD COLUMN "recruiterNotes" TEXT;
