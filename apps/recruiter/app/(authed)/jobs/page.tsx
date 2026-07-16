import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type JobStatus, type Prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { JobsTable } from '../../../components/jobs/JobsTable';
import { JobsFilterBar } from '../../../components/jobs/JobsFilterBar';
import { JobsPagination } from '../../../components/jobs/JobsPagination';
import { JobsSortSelect } from '../../../components/jobs/JobsSortSelect';
import { JOB_TYPE_LABELS, type JobCategory } from '../../../components/jobs/job-list-format';
import {
  JOBS_SORT_DEFAULT,
  PER_PAGE_DEFAULT,
  parseJobsSort,
  parsePerPage,
  type JobsSortKey,
} from '../../../components/jobs/jobs-list-params';

/**
 * Sort key → Prisma ordering. Non-unique sort columns get tiebreakers ending in
 * the unique `id` so adjacent skip/take pages never duplicate or drop a row at
 * the page seam (the companies-directory rule). Status sorts by the enum's
 * declaration order — DRAFT → PENDING_MODERATION → ACTIVE → EXPIRED → CLOSED —
 * a natural lifecycle order (a custom order would need raw SQL); ties fall
 * back to newest-first.
 */
const ORDER_BY: Record<JobsSortKey, Prisma.JobOrderByWithRelationInput[]> = {
  posted_desc: [{ postedAt: 'desc' }, { id: 'desc' }],
  posted_asc: [{ postedAt: 'asc' }, { id: 'asc' }],
  title_asc: [{ title: 'asc' }, { id: 'asc' }],
  title_desc: [{ title: 'desc' }, { id: 'desc' }],
  status_asc: [{ status: 'asc' }, { postedAt: 'desc' }, { id: 'desc' }],
  status_desc: [{ status: 'desc' }, { postedAt: 'desc' }, { id: 'desc' }],
};

// Postgres `Int` (int4) upper bound — a numeric search/param above this would
// overflow the column type and error, so we reject it during parsing.
const PG_INT_MAX = 2147483647;

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'PENDING_MODERATION',
  'ACTIVE',
  'EXPIRED',
  'CLOSED',
]);

const VALID_CATEGORIES: ReadonlySet<string> = new Set(Object.keys(JOB_TYPE_LABELS));

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Sp = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Upper cap on `?page=` — far above any real job count, and it keeps
// `(page - 1) * perPage` well inside Prisma's signed-64-bit `skip` bound
// (an uncapped 1e19 would throw client-side BEFORE the over-range redirect
// could rescue the request). Anything between the real last page and this cap
// falls through to the redirect as designed.
const MAX_PAGE = 1_000_000;

function readPage(sp: Sp): number {
  const n = Number(firstParam(sp['page']));
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_PAGE) : 1;
}

function readStatus(sp: Sp): JobStatus | null {
  const raw = firstParam(sp['status']);
  if (!raw || raw === 'ALL') return null;
  return VALID_STATUSES.has(raw) ? (raw as JobStatus) : null;
}

function readCategory(sp: Sp): JobCategory | null {
  const raw = firstParam(sp['category']);
  if (!raw) return null;
  return VALID_CATEGORIES.has(raw) ? (raw as JobCategory) : null;
}

/** A positive int within the Postgres int4 range, else null. */
function readIntId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= PG_INT_MAX ? n : null;
}

function readSearch(sp: Sp): string | null {
  const raw = firstParam(sp['q'])?.trim();
  return raw ? raw.slice(0, 100) : null;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const session = (await readUserFromCookie())!;
  const sp = await searchParams;

  const page = readPage(sp);
  const status = readStatus(sp);
  const category = readCategory(sp);
  const cityId = readIntId(firstParam(sp['city']));
  const postedById = readIntId(firstParam(sp['postedBy']));
  const q = readSearch(sp);
  const sort = parseJobsSort(sp['sort']);
  const perPage = parsePerPage(sp['perPage']);

  // The Jobs list is company-wide (every teammate's postings) so the Posted By
  // filter has options to choose from. Fall back to the recruiter's own jobs if
  // no company record resolves (defensive — the authed shell requires one).
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: { companyId: true },
  });
  const baseScope: Prisma.JobWhereInput = recruiter
    ? { companyId: recruiter.companyId }
    : { postedById: session.sub };

  const where: Prisma.JobWhereInput = { ...baseScope };
  if (status) where.status = status;
  if (category) where.jobType = category;
  if (cityId) where.primaryCityId = cityId;
  if (postedById) where.postedById = postedById;
  if (q) {
    // Title substring (case-insensitive) OR, when the query is a plain number,
    // an exact Job ID match.
    const or: Prisma.JobWhereInput[] = [{ title: { contains: q, mode: 'insensitive' } }];
    if (/^\d+$/.test(q)) {
      const asId = Number(q);
      if (Number.isSafeInteger(asId) && asId >= 1 && asId <= PG_INT_MAX) or.push({ id: asId });
    }
    where.OR = or;
  }

  const [rows, total, cityRows, posterRows] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: ORDER_BY[sort],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        title: true,
        status: true,
        postedAt: true,
        expiresAt: true,
        workMode: true,
        postedById: true,
        primaryCity: { select: { name: true } },
        locality: { select: { name: true } },
        skillIds: true,
      },
    }),
    prisma.job.count({ where }),
    // Dropdown option lists — derived from the company's ENTIRE job set (the
    // base scope, not the active filters) so the dropdowns never collapse as
    // you narrow the list. Sorted in JS to avoid distinct + relation-orderBy.
    prisma.job.findMany({
      where: { ...baseScope, primaryCityId: { not: null } },
      select: { primaryCityId: true, primaryCity: { select: { name: true } } },
      distinct: ['primaryCityId'],
    }),
    prisma.job.findMany({
      where: { ...baseScope, postedById: { not: null } },
      select: { postedById: true, postedBy: { select: { name: true } } },
      distinct: ['postedById'],
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Canonical query string for the current list state — every active filter
  // plus any non-default sort / page size. The client controls (filter bar,
  // sort headers, pagination) build their own hrefs from the live URL; this
  // one serves the over-range redirect below.
  const baseParams = new URLSearchParams();
  if (status) baseParams.set('status', status);
  if (category) baseParams.set('category', category);
  if (cityId) baseParams.set('city', String(cityId));
  if (postedById) baseParams.set('postedBy', String(postedById));
  if (q) baseParams.set('q', q);
  if (sort !== JOBS_SORT_DEFAULT) baseParams.set('sort', sort);
  if (perPage !== PER_PAGE_DEFAULT) baseParams.set('perPage', String(perPage));

  // A deep link can point past the end (stale bookmark, or a larger page size
  // shrinking the page count). Land on the real last page instead of a
  // confusing empty table — the same rule as the companies directory.
  if (page > totalPages) {
    if (totalPages > 1) baseParams.set('page', String(totalPages));
    const qs = baseParams.toString();
    redirect(qs ? `/jobs?${qs}` : '/jobs');
  }

  // Candidate-count metrics for the current page. One grouped query yields
  // Total Responses / New (APPLIED) / Shortlisted (SHORTLISTED) for every job on
  // the page; the "Matches" metric (applicants whose candidate skills overlap
  // the job's required skills) is a bounded set of per-job counts, run in
  // parallel and skipped for jobs that declare no required skills.
  const jobIds = rows.map((r) => r.id);

  const statusCounts =
    jobIds.length > 0
      ? await prisma.application.groupBy({
          by: ['jobId', 'status'],
          where: { jobId: { in: jobIds } },
          _count: { _all: true },
        })
      : [];

  const metricsByJob = new Map<number, { total: number; newCount: number; shortlisted: number }>(
    jobIds.map((jid) => [jid, { total: 0, newCount: 0, shortlisted: 0 }]),
  );
  for (const c of statusCounts) {
    const m = metricsByJob.get(c.jobId);
    if (!m) continue;
    const n = c._count._all;
    m.total += n;
    if (c.status === 'APPLIED') m.newCount += n;
    else if (c.status === 'SHORTLISTED') m.shortlisted += n;
  }

  const matchedByJob = new Map<number, number>(
    await Promise.all(
      rows.map(async (r): Promise<[number, number]> => {
        if (r.skillIds.length === 0) return [r.id, 0];
        const matched = await prisma.application.count({
          where: { jobId: r.id, user: { candidate: { skillIds: { hasSome: r.skillIds } } } },
        });
        return [r.id, matched];
      }),
    ),
  );

  const locations = cityRows
    .flatMap((r) =>
      r.primaryCityId != null && r.primaryCity ? [{ id: r.primaryCityId, name: r.primaryCity.name }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const posters = posterRows
    .flatMap((r) =>
      r.postedById != null && r.postedBy ? [{ id: r.postedById, name: r.postedBy.name }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered =
    status !== null || category !== null || cityId !== null || postedById !== null || q !== null;

  return (
    // data-wide → the authed layout widens the content column so the multi-metric
    // Jobs table fits without a horizontal page scroll (see (authed)/layout.tsx).
    <div data-wide className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Jobs</h1>
          {/* role=status → the new match count is announced when filters change. */}
          <p role="status" className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {total === 0
              ? filtered
                ? 'No jobs match these filters.'
                : 'No jobs posted yet.'
              : `${total} ${total === 1 ? 'job' : 'jobs'}.`}
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/post-job">Post a job</Link>
        </Button>
      </header>

      <JobsFilterBar locations={locations} posters={posters} />

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {filtered ? 'No jobs match these filters' : 'No jobs yet'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {filtered ? 'Try adjusting or clearing the filters.' : 'Post your first opening.'}
          </p>
        </div>
      ) : (
        <>
          {/* Below md the card layout has no column headers — sorting gets a
              dedicated select there (hidden at md+ where the headers take over). */}
          <JobsSortSelect />
          <JobsTable
            sort={sort}
            rows={rows.map((r) => {
              const m = metricsByJob.get(r.id) ?? { total: 0, newCount: 0, shortlisted: 0 };
              return {
                id: r.id,
                title: r.title,
                status: r.status,
                postedAt: r.postedAt,
                expiresAt: r.expiresAt,
                workMode: r.workMode,
                cityName: r.primaryCity?.name ?? null,
                localityName: r.locality?.name ?? null,
                isOwn: r.postedById === session.sub,
                totalResponses: m.total,
                newCount: m.newCount,
                shortlistedCount: m.shortlisted,
                matchedCount: matchedByJob.get(r.id) ?? 0,
              };
            })}
          />
        </>
      )}

      {/* Per-page select + Previous / numbered pages / Next. Self-hides when
          there is nothing to paginate or resize (≤ the smallest page size). */}
      <JobsPagination page={page} totalPages={totalPages} total={total} perPage={perPage} />
    </div>
  );
}
