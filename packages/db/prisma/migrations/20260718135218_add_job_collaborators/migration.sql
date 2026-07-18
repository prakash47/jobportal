-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_COLLABORATION';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "JobCollaborator" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCollaborator_userId_idx" ON "JobCollaborator"("userId");

-- CreateIndex
CREATE INDEX "JobCollaborator_jobId_idx" ON "JobCollaborator"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCollaborator_jobId_userId_key" ON "JobCollaborator"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
