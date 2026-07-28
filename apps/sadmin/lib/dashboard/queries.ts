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
import { isFlagEnabled } from '@jobportal/feature-flags';
import { formatDayLabel, type ChartPoint } from './chart';

/** How many days the trend charts cover. */
export const TREND_DAYS = 30;

// Every daily bucket below is computed in IST, not UTC, and the conversion is
// deliberately DOUBLE: `col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`.
//
// Prisma maps DateTime to `timestamp WITHOUT time zone`, and these columns hold
// UTC. On such a column a single `AT TIME ZONE 'Asia/Kolkata'` does the wrong
// thing — it *interprets* the value as IST wall-clock instead of converting to
// it — and is wrong in BOTH directions (verified against this database: a row
// stored 03:00 UTC lands on the previous day, and one stored 19:00 UTC fails to
// advance to the next). The first `AT TIME ZONE 'UTC'` promotes the value to a
// timestamptz that Postgres knows is UTC; the second converts it into IST.
//
// This is not academic: India is UTC+5:30, so the last 5h30m of every Indian day
// is already "tomorrow" in UTC. Bucketing in UTC would misfile every evening
// signup and application.
//
// `generate_series` produces the full window server-side, so each series comes
// back dense and zero-filled in ONE round trip — no 30 separate counts, and no
// date arithmetic in JS (which would re-introduce the timezone problem).

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

// ---------------------------------------------------------------------------
// Pending approvals
// ---------------------------------------------------------------------------

export interface PendingApprovals {
  /** Companies that have submitted KYC and are waiting on a reviewer. */
  companyVerification: number;
  /** Jobs sitting in PENDING_MODERATION. */
  jobPostings: number;
  /**
   * Whether job moderation is switched on at all. When it is OFF nothing can
   * ever ENTER PENDING_MODERATION, so a bare "0" would read as "all caught up"
   * when the truth is "this queue is not in use" — two very different things
   * for the person staffing it.
   */
  moderationEnabled: boolean;
}

export async function getPendingApprovals(): Promise<PendingApprovals> {
  const [companyVerification, jobPostings, moderationEnabled] = await Promise.all([
    // PENDING is the only reviewable state: NOT_SUBMITTED has nothing to look
    // at, and APPROVED/REJECTED have already been decided.
    prisma.companyKyc.count({ where: { status: 'PENDING' } }),
    prisma.job.count({ where: { status: 'PENDING_MODERATION' } }),
    // CLAUDE.md §4 — flag evaluation goes through @jobportal/feature-flags,
    // never an inline read of the FeatureFlag row. This key is one of the four
    // seeded without a FLAG constant, so it is referenced as a string literal
    // (the same way apps/recruiter references its killswitches).
    isFlagEnabled('moderation.jobs.enabled'),
  ]);

  return { companyVerification, jobPostings, moderationEnabled };
}

// ---------------------------------------------------------------------------
// New signups
// ---------------------------------------------------------------------------

export interface SignupStats {
  today: number;
  last7: number;
  last30: number;
  candidates30: number;
  recruiters30: number;
  /** One point per day, oldest first, always exactly TREND_DAYS long. */
  daily: ChartPoint[];
}

interface SignupRow {
  day: string;
  candidates: number;
  recruiters: number;
}

export async function getSignupStats(): Promise<SignupStats> {
  // ADMIN accounts are excluded from both series: internal staff logins are not
  // signups, and with a handful of real users a single seeded admin would
  // visibly distort "new signups today".
  const rows = await prisma.$queryRaw<SignupRow[]>`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
           COUNT(u.id) FILTER (WHERE u.role = 'CANDIDATE')::int AS candidates,
           COUNT(u.id) FILTER (WHERE u.role = 'RECRUITER')::int AS recruiters
    FROM generate_series(
           ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '29 days'),
           ((now() AT TIME ZONE 'Asia/Kolkata')::date),
           INTERVAL '1 day'
         ) AS d
    LEFT JOIN "User" u
      ON (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = d::date
    GROUP BY d
    ORDER BY d
  `;

  const daily: ChartPoint[] = rows.map((r) => ({
    label: formatDayLabel(r.day),
    value: r.candidates + r.recruiters,
  }));

  const values = daily.map((p) => p.value);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  return {
    // The series is IST-bucketed and ends on IST today, so the last element IS
    // today — derived rather than re-queried, which also guarantees the headline
    // figures can never disagree with the chart beside them.
    today: values[values.length - 1] ?? 0,
    last7: sum(values.slice(-7)),
    last30: sum(values),
    candidates30: sum(rows.map((r) => r.candidates)),
    recruiters30: sum(rows.map((r) => r.recruiters)),
    daily,
  };
}

// ---------------------------------------------------------------------------
// Platform activity trends
// ---------------------------------------------------------------------------

export interface ActivityTrends {
  jobs: ChartPoint[];
  applications: ChartPoint[];
  totalJobs: number;
  totalApplications: number;
}

interface DayCountRow {
  day: string;
  count: number;
}

export async function getActivityTrends(): Promise<ActivityTrends> {
  const [jobRows, appRows] = await Promise.all([
    // postedAt, not createdAt: a job enters the market when it is published.
    // Drafts have a null postedAt and are excluded by the join.
    prisma.$queryRaw<DayCountRow[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(j.id)::int AS count
      FROM generate_series(
             ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '29 days'),
             ((now() AT TIME ZONE 'Asia/Kolkata')::date),
             INTERVAL '1 day'
           ) AS d
      LEFT JOIN "Job" j
        ON (j."postedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = d::date
      GROUP BY d
      ORDER BY d
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(a.id)::int AS count
      FROM generate_series(
             ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '29 days'),
             ((now() AT TIME ZONE 'Asia/Kolkata')::date),
             INTERVAL '1 day'
           ) AS d
      LEFT JOIN "Application" a
        ON (a."appliedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = d::date
      GROUP BY d
      ORDER BY d
    `,
  ]);

  const toPoints = (rows: DayCountRow[]): ChartPoint[] =>
    rows.map((r) => ({ label: formatDayLabel(r.day), value: r.count }));

  const jobs = toPoints(jobRows);
  const applications = toPoints(appRows);
  const sum = (pts: ChartPoint[]) => pts.reduce((a, p) => a + p.value, 0);

  return {
    jobs,
    applications,
    totalJobs: sum(jobs),
    totalApplications: sum(applications),
  };
}
