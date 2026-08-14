// Job Postings master-list reads.
//
// Reads/writes split (the repo's topology): the LIST is display-only, so every
// row comes straight from Postgres via Prisma inside the RSC — the same call
// lib/candidates/queries.ts, lib/employers/queries.ts and lib/dashboard/queries.ts
// make and for the same reason.
//
// ⚠ Reads ONLY. The Delete action on this surface goes through apps/api
// (DELETE /admin/jobs/:id) so AdminGuard, the killswitch flag and the
// JOB_DELETED audit row all apply. A prisma.job.delete() here — or a server
// action wrapping one — would bypass all three, and would also skip the
// Elasticsearch de-index and the Cloudflare purge, leaving a searchable ghost
// pointing at a 404. That is not hypothetical: it is exactly what this file
// would be the convenient place to do.
//
// ⚠ Postgres, NOT Elasticsearch, and that is deliberate. The `jobs` index is
// populated only by the publish side-effects, so DRAFT / PENDING_MODERATION /
// CLOSED / EXPIRED postings are largely absent from it — a status-tabbed master
// list backed by ES would silently show an empty Draft tab.

import { prisma, type JobStatus, type Prisma } from '@jobportal/db';
import { JOB_POSTINGS_PAGE_SIZE, escapeLikePattern, type JobPostingTab } from './format';

export interface JobPostingListRow {
  id: number;
  title: string;
  canonicalSlug: string;
  status: JobStatus;
  /**
   * When the row was created — the only honest "age" this table has.
   *
   * ⚠ Deliberately NOT `postedAt`. That column looks like the right one and is
   * a trap: it is NOT NULL with @default(now()) and publish() stamps it even for
   * a job routed to PENDING_MODERATION, so it is populated for postings that
   * never reached a job seeker and cannot distinguish "went live" from "was
   * drafted". See the note in components/jobs/JobDetailView.tsx.
   */
  createdAt: Date;
  expiresAt: Date | null;
  company: { id: number; name: string } | null;
  /** Null when the poster has left: Job.postedById is SetNull, not Cascade. */
  postedBy: { name: string; email: string } | null;
  primaryCity: { name: string } | null;
  /**
   * Live count of applications against this posting. Drives the Delete guard —
   * a posting with any responses cannot be deleted, only closed.
   */
  applicationCount: number;
}

export interface JobPostingListPage {
  rows: JobPostingListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The job posting master list — every posting on the platform, newest first,
 * optionally narrowed to one status and/or a title/company search.
 *
 * ⚠ Unlike the review queue this deliberately applies NO baseline filter. A job
 * that was published while `moderation.jobs.enabled` was off has a null
 * reviewedAt and was never PENDING_MODERATION, so it appears in NEITHER review
 * view — this list is the only surface in the portal that can see it. Adding a
 * `reviewedAt` or status precondition here would silently reintroduce that
 * blind spot.
 */
export async function listJobPostings(
  page: number,
  status: JobPostingTab,
  q?: string,
): Promise<JobPostingListPage> {
  // Built ONCE and handed to both queries by reference. A divergence between the
  // two where-clauses would make the total, the count line, the pagination link
  // count and the over-range redirect all disagree with the visible rows — the
  // same trap lib/candidates/queries.ts calls out.
  //
  // Index notes: Job carries @@index([status, submittedForReviewAt]), so the
  // status arm is covered. The `contains` arms are NOT indexed — fine at this
  // scale, and named here rather than left to be rediscovered under load.
  const where: Prisma.JobWhereInput = {
    // 'ALL' is a pseudo-status: it means "no status predicate at all", so the key
    // is omitted rather than set to undefined.
    ...(status === 'ALL' ? {} : { status }),
    ...(q
      ? {
          OR: [
            // Escaped: Prisma's `contains` does not escape LIKE wildcards, so an
            // unescaped '%' would match every posting instead of the literal
            // character the admin typed. See escapeLikePattern.
            { title: { contains: escapeLikePattern(q), mode: 'insensitive' as const } },
            // Searching the COMPANY name as well as the title is what makes this
            // box useful to a super admin: "show me everything Acme has posted"
            // is the common question, and the company is a column on the table.
            {
              company: {
                name: { contains: escapeLikePattern(q), mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      // createdAt, NOT postedAt. postedAt does not mean what its name suggests:
      // it is NOT NULL with @default(now()) and publish() stamps it even when the
      // job routes to PENDING_MODERATION, while reopen() leaves a months-old
      // value on a job returning to review. Sorting on it would therefore
      // interleave never-live drafts with genuinely live postings on a
      // "newest first" list. createdAt is NOT NULL and unambiguously means when
      // the posting came into existence.
      //
      // `id` breaks ties deterministically. Offset pagination is only sound if
      // the sort is a total order: two jobs sharing a createdAt could otherwise
      // be ordered differently between the page-1 and page-2 queries, dropping
      // one row and duplicating another across the seam. Seeded demo jobs are
      // inserted in a single batch, so equal timestamps are a live possibility
      // rather than a theoretical one.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * JOB_POSTINGS_PAGE_SIZE,
      take: JOB_POSTINGS_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        canonicalSlug: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        company: { select: { id: true, name: true } },
        postedBy: { select: { name: true, email: true } },
        primaryCity: { select: { name: true } },
        // One aggregate on the page query rather than N count() calls, and it is
        // not cosmetic: it is what decides whether Delete is offered at all.
        _count: { select: { applications: true } },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return {
    rows: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      canonicalSlug: j.canonicalSlug,
      status: j.status,
      createdAt: j.createdAt,
      expiresAt: j.expiresAt,
      company: j.company,
      postedBy: j.postedBy,
      primaryCity: j.primaryCity,
      applicationCount: j._count.applications,
    })),
    total,
    page,
    pageSize: JOB_POSTINGS_PAGE_SIZE,
  };
}

/**
 * How many applications a single posting has.
 *
 * The detail page needs this for the same Delete guard the list applies, and the
 * admin-jobs API detail endpoint does not return it (that endpoint serves the
 * moderation console, where the count is irrelevant). Read here rather than
 * widening the shared endpoint's payload for one caller.
 */
export async function countJobApplications(jobId: number): Promise<number> {
  return prisma.application.count({ where: { jobId } });
}
