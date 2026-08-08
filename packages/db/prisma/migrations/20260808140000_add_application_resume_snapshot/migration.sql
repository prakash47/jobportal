-- ADR 0002 decision 7 — record WHICH resume was submitted with an application.
--
-- Until now the recruiter's resume view resolved Candidate.activeResume, i.e.
-- the candidate's CURRENT CV. Replacing a CV therefore rewrote what recruiters
-- saw for every application already sent, and deleting one made them all read
-- "no resume on file". This column pins the document at submission time.
--
-- Nullable, and permanently so: the applications that predate it cannot be
-- backfilled, because which CV was actually sent is genuinely unknown. Those
-- rows keep the old behaviour; new applications carry a snapshot.
ALTER TABLE "Application" ADD COLUMN "resumeId" INTEGER;

-- Postgres does not index a foreign key automatically. Without this, every
-- Resume delete seq-scans Application to apply the ON DELETE SET NULL, and the
-- account-deletion work cascades Candidate -> Resume, so that scan would run
-- once per resume.
CREATE INDEX "Application_resumeId_idx" ON "Application"("resumeId");

-- SET NULL rather than RESTRICT so a hard delete can never wedge account
-- deletion. Resumes are soft-deleted in practice (Resume."deletedAt"), which
-- leaves the row and therefore the snapshot intact.
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the dead column this replaces. "resumeUrl" was declared with the model
-- and never written by any code path in the repository -- verified before this
-- migration was written: 373 applications, 0 non-NULL values. No expand-then-
-- contract phase is needed because there is nothing to migrate and no reader to
-- switch; leaving it beside the new "resumeId" would only invite a future
-- developer to write to the one that does nothing.
ALTER TABLE "Application" DROP COLUMN "resumeUrl";
