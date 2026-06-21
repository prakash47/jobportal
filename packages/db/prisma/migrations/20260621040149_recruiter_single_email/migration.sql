/*
  Warnings:

  - You are about to drop the column `workEmail` on the `Recruiter` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Recruiter" DROP COLUMN "workEmail";
