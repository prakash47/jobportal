-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'AUTHORIZED_PERSON_ID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'KYC_SUBMITTED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'KYC_DOCUMENT_UPLOAD';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'KYC_DOCUMENT_DELETE';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'KYC_APPROVED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'KYC_REJECTED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "CompanyKyc" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "legalName" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "registrationNumber" TEXT,
    "authorizedPersonName" TEXT,
    "authorizedPersonDesignation" TEXT,
    "authorizedPersonIdType" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyKyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" SERIAL NOT NULL,
    "companyKycId" INTEGER NOT NULL,
    "docType" "KycDocumentType" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "scanStatus" "ResumeScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyKyc_companyId_key" ON "CompanyKyc"("companyId");

-- CreateIndex
CREATE INDEX "CompanyKyc_status_idx" ON "CompanyKyc"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KycDocument_r2Key_key" ON "KycDocument"("r2Key");

-- CreateIndex
CREATE INDEX "KycDocument_companyKycId_deletedAt_idx" ON "KycDocument"("companyKycId", "deletedAt");

-- AddForeignKey
ALTER TABLE "CompanyKyc" ADD CONSTRAINT "CompanyKyc_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_companyKycId_fkey" FOREIGN KEY ("companyKycId") REFERENCES "CompanyKyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
