-- SRS §4.9.1 — Recruiter work-email and verification flag. No live Recruiter
-- rows yet, so adding NOT NULL workEmail without a default is safe.

ALTER TABLE "Recruiter"
  ADD COLUMN "workEmail" TEXT NOT NULL,
  ADD COLUMN "workEmailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Index for the admin "needs verification" list (Task 16).
CREATE INDEX "Recruiter_workEmailVerified_idx" ON "Recruiter"("workEmailVerified");
