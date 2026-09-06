import { prisma, type ApplicationStatus, type Prisma } from '@jobportal/db';
import { requireUser } from '../../lib/auth/require-user';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { Pagination } from '../../components/dashboard/Pagination';
import {
  ApplicationRow,
  ApplicationsEmpty,
  ApplicationsToolbar,
  StatusFilter,
} from '../../components/applications';
import { readSort } from '../../lib/applications/sort';
import type { HistoryEntry } from '../../components/applications/StatusTimeline';

// 10, down from 20, on the reporter's request. It also makes the pagination
// control DISCOVERABLE: it hides itself at a single page, so an account with
// nineteen applications never saw it at 20-per-page and the feature looked
// missing. Ten is the conventional dashboard-list size and halves the scroll on
// a phone.
const PAGE_SIZE = 10;

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'APPLIED',
  'IN_REVIEW',
  'SHORTLISTED',
  'INTERVIEWED',
  'OFFERED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
]);

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** `?app=<id>` — deep link to one application from elsewhere in the product. */
function readAppId(sp: Record<string, string | string[] | undefined>): number | null {
  const raw = Array.isArray(sp['app']) ? sp['app'][0] : sp['app'];
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readQuery(sp: Record<string, string | string[] | undefined>): string {
  const raw = Array.isArray(sp['q']) ? sp['q'][0] : sp['q'];
  // Trimmed and capped: this goes straight into a Prisma `contains`, and an
  // unbounded string is a pointless load. 100 chars is far beyond any real job
  // title or company name.
  return (raw ?? '').trim().slice(0, 100);
}

function readStatus(sp: Record<string, string | string[] | undefined>): ApplicationStatus | null {
  const raw = Array.isArray(sp['status']) ? sp['status'][0] : sp['status'];
  if (!raw || raw === 'ALL') return null;
  if (VALID_STATUSES.has(raw)) return raw as ApplicationStatus;
  return null;
}

// statusHistory is a Prisma JSON column; narrow it to the entry shape the API
// writes ({from,to,at,by} appended per transition) and drop anything else.
// `by` is only carried through when it is a known actor — the API's Actor
// union also reserves SYSTEM, which must not render as "by recruiter".
function parseHistory(raw: Prisma.JsonValue | null): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const rec = e as Record<string, unknown>;
    if (typeof rec['to'] !== 'string' || typeof rec['at'] !== 'string') continue;
    const by = rec['by'];
    out.push({
      from: rec['from'] as HistoryEntry['from'],
      to: rec['to'] as HistoryEntry['to'],
      at: rec['at'],
      ...(by === 'CANDIDATE' || by === 'RECRUITER' ? { by } : {}),
    });
  }
  return out;
}

// Server-side date label with a fixed IST zone so the SSR pass and the client
// hydration (this feeds a client component) can never disagree on the day.
const formatAppliedAt = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

/**
 * "Rows that sort before this one", expressed for each sort mode.
 *
 * This is what turns an application id into a page number. Each clause mirrors
 * its `orderBy` exactly — get one backwards and the deep link lands a page off,
 * which is the kind of bug that only shows up once a list outgrows one page.
 *
 * The `id` tiebreak is not decoration: `appliedAt` has second resolution, and
 * two applications sent in the same second would otherwise have an ambiguous
 * position, so the count could disagree with the page the row actually renders
 * on.
 */
function positionFilter(
  sort: ReturnType<typeof readSort>,
  target: { id: number; appliedAt: Date; job: { title: string; company: { name: string } } },
): Prisma.ApplicationWhereInput {
  if (sort === 'oldest') {
    return {
      OR: [
        { appliedAt: { lt: target.appliedAt } },
        { appliedAt: target.appliedAt, id: { lt: target.id } },
      ],
    };
  }
  if (sort === 'company') {
    return {
      OR: [
        { job: { company: { name: { lt: target.job.company.name } } } },
        {
          job: { company: { name: target.job.company.name } },
          id: { lt: target.id },
        },
      ],
    };
  }
  // 'recent' — newest first, so "before" means a LATER appliedAt.
  return {
    OR: [
      { appliedAt: { gt: target.appliedAt } },
      { appliedAt: target.appliedAt, id: { gt: target.id } },
    ],
  };
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const session = await requireUser();
  const sp = await searchParams;
  const requestedPage = readPage(sp);
  const status = readStatus(sp);
  const deepLinkId = readAppId(sp);

  const q = readQuery(sp);
  const sort = readSort(Array.isArray(sp['sort']) ? sp['sort'][0] : sp['sort']);

  // Title OR company, case-insensitive. `contains` is a LIKE — fine against a
  // single candidate's application count, and deliberately NOT Elasticsearch:
  // this searches a private list of at most a few hundred rows, not the public
  // job corpus. Built once and shared by the list query and the chip counts so
  // the two can never disagree.
  const jobFilter: Prisma.JobWhereInput | null = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }
    : null;

  // Assembled with spreads rather than conditional assignment: under
  // `exactOptionalPropertyTypes` an explicitly-undefined optional property is
  // not the same as an absent one, and Prisma's input types reject it.
  const where: Prisma.ApplicationWhereInput = {
    userId: session.sub,
    ...(status ? { status } : {}),
    ...(jobFilter ? { job: jobFilter } : {}),
  };

  const orderBy: Prisma.ApplicationOrderByWithRelationInput =
    sort === 'oldest'
      ? { appliedAt: 'asc' }
      : sort === 'company'
        ? { job: { company: { name: 'asc' } } }
        : { appliedAt: 'desc' };

  // A deep link names an application, not a page — and the row it wants is very
  // often not on page 1. Resolve its position under the CURRENT ordering and
  // jump straight there, so the link works at any list size.
  //
  // An explicit ?page= always wins: it means the user has since paged around,
  // and yanking them back would fight their navigation.
  let page = requestedPage;
  if (deepLinkId !== null && !sp['page']) {
    const target = await prisma.application.findFirst({
      // userId scopes it: an id belonging to someone else must resolve to
      // nothing rather than leak that it exists.
      where: { id: deepLinkId, userId: session.sub },
      select: { id: true, appliedAt: true, job: { select: { title: true, company: { select: { name: true } } } } },
    });
    if (target) {
      // Count the rows that sort BEFORE it under the same orderBy. The id
      // tiebreak matters: two applications sent in the same second would
      // otherwise give an unstable position and an off-by-one page.
      const before = await prisma.application.count({
        where: {
          ...where,
          ...positionFilter(sort, target),
        },
      });
      page = Math.floor(before / PAGE_SIZE) + 1;
    }
  }

  const [rows, total, grouped] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        statusHistory: true,
        coverLetter: true,
        // The resume SNAPSHOT for this application, not the candidate's current
        // one. Application.resumeId exists precisely so replacing your CV does
        // not rewrite history — reading `Candidate.activeResume` here would
        // reintroduce the bug that column was added to fix.
        resume: {
          select: { originalFilename: true, uploadedAt: true, sizeBytes: true },
        },
        job: {
          select: {
            title: true,
            canonicalSlug: true,
            cityIds: true,
            employmentType: true,
            workMode: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.application.count({ where }),
    // Per-status chip counts ignore the STATUS filter (so every chip shows its
    // own total) but must respect the SEARCH — otherwise searching "Nimbus"
    // would leave a chip reading "Shortlisted 2" above a list containing one.
    prisma.application.groupBy({
      by: ['status'],
      where: { userId: session.sub, ...(jobFilter ? { job: jobFilter } : {}) },
      _count: { _all: true },
    }),
  ]);

  // One query for every city on the page rather than one per row: cityIds is an
  // Int[] on Job, so N rows would otherwise be N lookups.
  const cityIds = [...new Set(rows.flatMap((r) => r.job.cityIds))];
  const cities =
    cityIds.length > 0
      ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
      : [];
  const cityNameById = new Map(cities.map((c) => [c.id, c.name]));

  const counts: Record<string, number> = {};
  let all = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    all += g._count._all;
  }
  counts['ALL'] = all;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== null || q !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={
          total === 0
            ? filtered
              ? 'Nothing matches this filter.'
              : 'You have not applied to anything yet.'
            : q
              ? `${total} ${total === 1 ? 'application' : 'applications'} matching “${q}”.`
              : `${total} ${total === 1 ? 'application' : 'applications'}.`
        }
      />

      <StatusFilter counts={counts} />

      <ApplicationsToolbar resultCount={total} />

      {rows.length === 0 ? (
        <ApplicationsEmpty filtered={filtered} />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)] overflow-hidden">
          {rows.map((r) => (
            <ApplicationRow
              key={r.id}
              id={r.id}
              status={r.status}
              appliedAtIso={r.appliedAt.toISOString()}
              appliedAtLabel={formatAppliedAt(r.appliedAt)}
              history={parseHistory(r.statusHistory)}
              deepLinked={r.id === deepLinkId}
              job={{
                title: r.job.title,
                canonicalSlug: r.job.canonicalSlug,
                company: r.job.company,
                employmentType: r.job.employmentType,
                workMode: r.job.workMode,
                cityNames: r.job.cityIds
                  .map((id) => cityNameById.get(id))
                  .filter((n): n is string => Boolean(n)),
              }}
              coverLetter={r.coverLetter}
              resume={
                r.resume
                  ? {
                      originalFilename: r.resume.originalFilename,
                      // Formatted on the server for the same reason appliedAt is:
                      // an ICU/timezone difference between server and client is a
                      // hydration mismatch.
                      uploadedAtLabel: formatAppliedAt(r.resume.uploadedAt),
                      sizeBytes: r.resume.sizeBytes,
                    }
                  : null
              }
            />
          ))}
        </ContentCard>
      )}

      {/* Every active parameter is threaded through, or clicking "Older" would
          silently drop the search and the sort and show page 2 of a different
          list. `sort` is omitted when it is the default so the URL stays clean. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        baseHref="/applications"
        params={{
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
          ...(sort !== 'recent' ? { sort } : {}),
        }}
      />
    </div>
  );
}
