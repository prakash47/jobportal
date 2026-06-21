-- Candidate work-mode + job-type preferences for the onboarding wizard (SRS §4.3).
-- Additive + non-destructive: existing rows backfill to empty arrays via the
-- column default. The "WorkMode" / "EmploymentType" enum types already exist
-- (created with the Job model), so this only adds columns — no CREATE TYPE.

-- AlterTable
ALTER TABLE "Candidate"
  ADD COLUMN "preferredWorkModes" "WorkMode"[] DEFAULT ARRAY[]::"WorkMode"[],
  ADD COLUMN "preferredJobTypes"  "EmploymentType"[] DEFAULT ARRAY[]::"EmploymentType"[];
