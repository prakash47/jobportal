/*
  Warnings:

  - You are about to drop the column `consumedAt` on the `OtpChallenge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "OtpChallenge" DROP COLUMN "consumedAt",
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
