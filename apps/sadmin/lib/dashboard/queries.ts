// Super Admin dashboard reads.
//
// Reads/writes split (the repo's topology): this dashboard is display-only, so
// every number comes straight from Postgres via Prisma inside the RSC — no BFF
// hop and no new API endpoint. Anything that ever WRITES from this portal must
// go through apps/api instead, so AdminGuard, Zod validation and audit logging
// all apply.
//
// Not wrapped in React `cache()`: only one component calls this. The recruiter
// dashboard memoises its recruiter lookup because the layout AND the page each
// paid for it independently; there is no second caller here, so caching would
// add indirection and buy nothing. Add it when a second caller appears.

import { prisma } from '@jobportal/db';

export interface PlatformKpis {
  /** Recruiter accounts that can currently sign in. */
  recruiters: number;
  /** Registered job seekers. */
  seekers: number;
  /** Jobs live and visible to candidates ("Open" in every recruiter-facing UI). */
  openJobs: number;
}

/**
 * The three platform-wide totals on the dashboard.
 *
 * Each `where` below is load-bearing, and the obvious query is wrong in BOTH
 * directions — hence the unit tests pinning them.
 */
export async function getPlatformKpis(): Promise<PlatformKpis> {
  const [recruiters, seekers, openJobs] = await Promise.all([
    // RECRUITERS — count Recruiter rows, not `User where role='RECRUITER'`.
    // Removing a teammate is a SOFT delete: it sets Recruiter.deactivatedAt and
    // revokes their sessions, but never touches the User row, so their role
    // stays 'RECRUITER' forever. Counting users would therefore keep counting
    // people who can no longer sign in, and the number could only ever grow.
    // deactivatedAt is reversible (re-inviting clears it on the same row), so
    // this must be computed live and never denormalised.
    prisma.recruiter.count({ where: { deactivatedAt: null } }),

    // SEEKERS — count User rows, not Candidate rows. The Candidate profile row
    // is provisioned LAZILY on first /profile read; email+password registration
    // creates only the User, and the Google signup path swallows a failed
    // Candidate create. Counting Candidate rows therefore UNDER-counts real
    // registrations. There is no soft-delete on User, so no exclusion applies.
    // Index-backed by @@index([role]).
    prisma.user.count({ where: { role: 'CANDIDATE' } }),

    // OPEN JOBS — 'Open' is the label the recruiter UI gives JobStatus.ACTIVE
    // (JOB_STATUS_META). DRAFT / PENDING_MODERATION / EXPIRED / CLOSED are all
    // real states and none of them is open. Note this figure decays on its own:
    // a daily BullMQ sweep flips ACTIVE→EXPIRED once expiresAt passes.
    prisma.job.count({ where: { status: 'ACTIVE' } }),
  ]);

  return { recruiters, seekers, openJobs };
}
