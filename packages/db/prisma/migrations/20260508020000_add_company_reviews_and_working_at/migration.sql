-- SRS §4.7 — denormalised review aggregates on Company + a CMS-managed
-- workingAtSections JSON slot, plus a CompanyReview table for the public
-- profile page's read-only Reviews section. No live company / review rows
-- yet (recruiters create them), so adding NOT NULL columns is safe.

-- AlterTable: Company
ALTER TABLE "Company"
  ADD COLUMN "averageRating" DOUBLE PRECISION,
  ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workingAtSections" JSONB;

-- CreateTable
CREATE TABLE "CompanyReview" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyReview_companyId_createdAt_idx" ON "CompanyReview"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
