import { prisma, type Prisma } from '@jobportal/db';
import { requireUser } from '../../lib/auth/require-user';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { Pagination } from '../../components/dashboard/Pagination';
import { SavedJobRow, SavedJobsEmpty, SavedJobsToolbar } from '../../components/saved-jobs';
import { readSort, type SortValue } from '../../lib/saved-jobs/sort';

// 10, matching the applications list. Also makes pagination discoverable — it
// hides itself at a single page, so a 20 page size meant most accounts never
// saw the control at all.
const PAGE_SIZE = 10;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readQuery(sp: Record<string, string | string[] | undefined>): string {
  const raw = Array.isArray(sp['q']) ? sp['q'][0] : sp['q'];
  // Trimmed and capped — this feeds a Prisma `contains` and an unbounded string
  // is pointless load.
  return (raw ?? '').trim().slice(0, 100);
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// SRS §4.4 — paginated saved-jobs dashboard. Lookup happens server-side via
// Prisma so the page is one round-trip; the API list endpoint exists for
// programmatic / future-mobile clients.
async function loadSavedJobsPage(userId: number, page: number, q: string, sort: SortValue) {
  // Search matches the job title OR the company name, case-insensitive —
  // exactly what the applications list searches, so the two behave alike.
  const jobFilter: Prisma.JobWhereInput | null = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }
    : null;

  // Spreads rather than conditional assignment: under exactOptionalPropertyTypes
  // an explicitly-undefined optional property is not the same as an absent one,
  // and Prisma's input types reject it.
  const where: Prisma.SavedJobWhereInput = {
    userId,
    ...(jobFilter ? { job: jobFilter } : {}),
  };

  const orderBy: Prisma.SavedJobOrderByWithRelationInput =
    sort === 'oldest'
      ? { savedAt: 'asc' }
      : sort === 'company'
        ? { job: { company: { name: 'asc' } } }
        : sort === 'title'
          ? { job: { title: 'asc' } }
          : { savedAt: 'desc' };

  const [savedRows, total] = await Promise.all([
    prisma.savedJob.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        jobId: true,
        savedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            canonicalSlug: true,
            status: true,
            // Metadata for the row pills. Selected here rather than fetched per
            // row so the page stays one round-trip.
            cityIds: true,
            experienceMinYears: true,
            experienceMaxYears: true,
            salaryMinPaise: true,
            salaryMaxPaise: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.savedJob.count({ where }),
  ]);

  const jobIds = savedRows.map((r) => r.jobId);
  const applications = jobIds.length
    ? await prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        // `id` is new: the status pill links to the application it describes,
        // so it needs to know which one.
        select: { id: true, jobId: true, status: true },
      })
    : [];
  const appliedByJobId = new Map<number, { id: number; status: string }>();
  for (const a of applications) appliedByJobId.set(a.jobId, { id: a.id, status: a.status });

  // One city lookup for the whole page — cityIds is an Int[] on Job, so doing
  // this per row would be N queries.
  const cityIds = [...new Set(savedRows.flatMap((r) => r.job.cityIds))];
  const cities =
    cityIds.length > 0
      ? await prisma.city.findMany({
          where: { id: { in: cityIds } },
          select: { id: true, name: true },
        })
      : [];
  const cityNameById = new Map(cities.map((c) => [c.id, c.name]));

  return {
    rows: savedRows.map((r) => {
      const app = appliedByJobId.get(r.jobId) ?? null;
      return {
        ...r,
        applied: app !== null,
        appliedStatus: app?.status ?? null,
        applicationId: app?.id ?? null,
        cityNames: r.job.cityIds
          .map((id) => cityNameById.get(id))
          .filter((n): n is string => Boolean(n)),
      };
    }),
    total,
  };
}

export default async function SavedJobsPage({ searchParams }: PageProps) {
  const session = await requireUser();
  const sp = await searchParams;
  const page = readPage(sp);

  const q = readQuery(sp);
  const sort = readSort(Array.isArray(sp['sort']) ? sp['sort'][0] : sp['sort']);

  const { rows, total } = await loadSavedJobsPage(session.sub, page, q, sort);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved jobs"
        description={
          total === 0
            ? q
              ? `No saved jobs match “${q}”.`
              : 'Nothing saved yet.'
            : q
              ? `${total} ${total === 1 ? 'role' : 'roles'} matching “${q}”.`
              : `${total} ${total === 1 ? 'role' : 'roles'} bookmarked.`
        }
      />

      {/* Rendered even when a search returns nothing, so the box the user just
          typed into does not disappear along with the results. */}
      <SavedJobsToolbar resultCount={total} />

      {rows.length === 0 ? (
        <SavedJobsEmpty />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)] overflow-hidden">
          {rows.map((r) => (
            <SavedJobRow
              key={r.jobId}
              jobId={r.jobId}
              savedAt={r.savedAt}
              job={r.job}
              cityNames={r.cityNames}
              applied={r.applied}
              appliedStatus={r.appliedStatus}
              applicationId={r.applicationId}
            />
          ))}
        </ContentCard>
      )}

      {/* Both params threaded through, or "Older" would silently drop the search
          and the sort and show page 2 of a different list. */}
      <Pagination
        page={page}
        totalPages={totalPages}
        baseHref="/saved-jobs"
        params={{
          ...(q ? { q } : {}),
          ...(sort !== 'recent' ? { sort } : {}),
        }}
      />
    </div>
  );
}
