-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- Turn job moderation ON.
--
-- A DATA migration, not a schema change. The seed's default was flipped to
-- `enabled: true` in the same PR, but seedFlags upserts with `update: {}` — it
-- deliberately never overwrites an admin-toggled flag — so a new default only
-- ever reaches a database seeded from scratch. Every developer machine and every
-- deployed environment already carries this row at `enabled = false`, and this
-- is what moves them.
--
-- Guarded on `enabled = false` so it is a no-op on a freshly seeded database
-- (where the seed already wrote true) and, more importantly, so it can never
-- resurrect a flag an admin has deliberately turned back off.
UPDATE "FeatureFlag"
SET "enabled" = true, "updatedAt" = NOW()
WHERE "key" = 'moderation.jobs.enabled' AND "enabled" = false;

-- Cache note: packages/feature-flags caches each flag for 30s both in-process
-- and in Redis, and only invalidates through setFlag(). A direct UPDATE like
-- this publishes no invalidation, so a long-running API process can serve the
-- stale value for up to 30 seconds. Acceptable here because a migration runs at
-- deploy time, when the API is restarting anyway — and it is precisely why the
-- admin console, not SQL, is the supported way to toggle a flag day to day.
