-- Candidate self-identified gender for the onboarding "Headline & preferences"
-- step (SRS §4.3). Additive + non-destructive: a new enum type + one nullable
-- column. Existing rows are unaffected.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "gender" "Gender";
