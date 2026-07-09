-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FREE', 'HOT_VACANCY', 'SMB', 'INTERNSHIP');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "internshipDurationMonths" INTEGER,
ADD COLUMN     "jobType" "JobType" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "localityId" INTEGER,
ADD COLUMN     "openings" INTEGER,
ADD COLUMN     "qualifications" TEXT;

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "Locality" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Locality_slug_key" ON "Locality"("slug");

-- CreateIndex
CREATE INDEX "Locality_cityId_idx" ON "Locality"("cityId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
