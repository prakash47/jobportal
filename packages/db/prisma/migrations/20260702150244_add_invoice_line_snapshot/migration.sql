-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "planNameSnapshot" TEXT;

-- Backfill sortOrder for databases seeded BEFORE the recruiter plans landed:
-- the seed upsert uses update:{} so it never renumbers enterprise-yearly from
-- its original 4 to 6, which would tie it with recruiter-starter-monthly and
-- make /plans card order nondeterministic. The /plans query also carries a
-- price tiebreaker, but this keeps the intended Starter -> Growth -> Enterprise
-- order on every DB. No-op on freshly-seeded DBs (already 6).
UPDATE "SubscriptionPlan" SET "sortOrder" = 6 WHERE "slug" = 'enterprise-yearly';
