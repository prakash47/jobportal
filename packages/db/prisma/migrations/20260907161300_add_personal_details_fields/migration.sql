-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "currentCityId" INTEGER,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "nationality" TEXT;

-- AlterTable
ALTER TABLE "CandidateLanguage" ADD COLUMN     "canRead" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canSpeak" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canWrite" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE INDEX "Candidate_currentCityId_idx" ON "Candidate"("currentCityId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_currentCityId_fkey" FOREIGN KEY ("currentCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
