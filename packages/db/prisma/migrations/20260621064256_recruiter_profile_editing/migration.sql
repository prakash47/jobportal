-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('STARTUP', 'INDIAN_MNC', 'FOREIGN_MNC', 'PRIVATE', 'PUBLIC', 'GOVERNMENT_PSU', 'NGO_NONPROFIT', 'PARTNERSHIP', 'SOLE_PROPRIETORSHIP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'RECRUITER_PROFILE_UPDATE';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'COMPANY_UPDATE';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'COMPANY_LOGO_UPDATE';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "companyType" "CompanyType";

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Recruiter" ADD COLUMN     "altPocEmail" TEXT,
ADD COLUMN     "altPocName" TEXT,
ADD COLUMN     "altPocPhone" TEXT,
ADD COLUMN     "department" TEXT;
