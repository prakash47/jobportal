-- CreateEnum
CREATE TYPE "AdminStaffRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'FINANCE_ADMIN');

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "AdminStaff" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "staffRole" "AdminStaffRole" NOT NULL,
    "permissions" JSONB,
    "deactivatedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminStaff_userId_key" ON "AdminStaff"("userId");

-- CreateIndex
CREATE INDEX "AdminStaff_staffRole_deactivatedAt_idx" ON "AdminStaff"("staffRole", "deactivatedAt");

-- AddForeignKey
ALTER TABLE "AdminStaff" ADD CONSTRAINT "AdminStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
