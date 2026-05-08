-- SRS §4.8 — convert Article.status from String to ArticleStatus enum and
-- add CMS fields (tags, faqs, coverImageUrl). No live Article rows yet, so
-- the enum cast and NOT NULL DEFAULT additions are safe without backfill.

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable: cast status column. Two-step is required because Postgres
-- can't directly alter a TEXT column to a USER-DEFINED type without a USING
-- clause when there are existing rows.
ALTER TABLE "Article"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ArticleStatus" USING "status"::"ArticleStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: add CMS fields
ALTER TABLE "Article"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "faqs" JSONB,
  ADD COLUMN "coverImageUrl" TEXT;

-- CreateIndex (GIN index for tag filtering — substring/array containment is fast)
CREATE INDEX "Article_tags_idx" ON "Article" USING GIN ("tags");
