import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma, type Prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../../../lib/auth/server-session';
import { ApplicantsTable, type ApplicantRow } from '../../../../../components/jobs/ApplicantsTable';
import { ApplicantsSortToggle } from '../../../../../components/jobs/ApplicantsSortToggle';
import { ApplicantsFilterTabs } from '../../../../../components/jobs/ApplicantsFilterTabs';
import { parseApplicantFilter, type ApplicantFilter } from '../../../../../components/jobs/applicant-filter';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SortKey = 'date' | 'status';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function readSort(sp: Record<string, string | string[] | undefined>): SortKey {
  const raw = Array.isArray(sp['sort']) ? sp['sort'][0] : sp['sort'];
  return raw === 'status' ? 'status' : 'date';
}

/** Human count for the sub-header, e.g. "5 new" / "3 shortlisted" / "8 matches". */
function countLabel(total: number, filter: ApplicantFilter | null): string {
  if (filter === 'new') return `${total} new`;
  if (filter === 'shortlisted') return `${total} shortlisted`;
  if (filter === 'rejected') return `${total} rejected`;
  if (filter === 'matched') return `${total} ${total === 1 ? 'match' : 'matches'}`;
  return `${total} ${total === 1 ? 'applicant' : 'applicants'}`;
}

/** Filter-aware empty-state title (only used when a filter is active). */
function emptyTitleFor(filter: ApplicantFilter | null): string | undefined {
  if (filter === 'new') return 'No new applications';
  if (filter === 'shortlisted') return 'No shortlisted applicants';
  if (filter === 'rejected') return 'No rejected applicants';
  if (filter === 'matched') return 'No matching candidates';
  return undefined;
}

export default async function ApplicantsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  // Integer within Postgres int4 — a float ('1.5') or over-range id would throw
  // inside Prisma (500) instead of the 404 an unknown id deserves. Aligned with
  // the sibling detail/edit pages (this list is now reached from the detail page).
  if (!Number.isInteger(jobId) || jobId < 1 || jobId > 2147483647) notFound();

  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);
  const sort = readSort(sp);
  const filter = parseApplicantFilter(sp['filter']);

  // Owner-OR-collaborator lookup (SRS §4.9 Collaborate → "respond to this job").
  // Cross-recruiter access produces 404 (no leak), matching the API pattern.
  // `skillIds` powers the "matched" filter; the filtered `collaborators` sub-select
  // is non-empty only when the viewer is a collaborator on this job.
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      postedById: true,
      status: true,
      skillIds: true,
      collaborators: { where: { userId: session.sub }, select: { userId: true }, take: 1 },
    },
  });
  if (!job || (job.postedById !== session.sub && job.collaborators.length === 0)) notFound();

  // Base scope + the active filter. `new`/`shortlisted` map to a status; the
  // `matched` filter mirrors the Jobs-list "Matches" column — applicants whose
  // candidate skills overlap the job's required skills (empty ⇒ nothing matches).
  const where: Prisma.ApplicationWhereInput = { jobId };
  if (filter === 'new') where.status = 'APPLIED';
  else if (filter === 'shortlisted') where.status = 'SHORTLISTED';
  else if (filter === 'rejected') where.status = 'REJECTED';
  else if (filter === 'matched') {
    if (job.skillIds.length > 0) {
      where.user = { candidate: { skillIds: { hasSome: job.skillIds } } };
    } else {
      where.id = { in: [] }; // job declares no required skills → no matches
    }
  }

  const [applicants, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy:
        sort === 'status' ? [{ status: 'asc' }, { appliedAt: 'desc' }] : { appliedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        recruiterNotes: true,
        user: {
          select: {
            name: true,
            email: true,
            candidate: {
              select: {
                headline: true,
                experienceMonths: true,
                currentTitle: true,
                expectedSalaryMinPaise: true,
                expectedSalaryMaxPaise: true,
                activeResumeId: true,
              },
            },
          },
        },
      },
    }),
    prisma.application.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Serialise the dates so the client component receives plain strings.
  const rows: ApplicantRow[] = applicants.map((a) => ({
    id: a.id,
    status: a.status,
    appliedAt: a.appliedAt.toISOString(),
    recruiterNotes: a.recruiterNotes,
    user: a.user,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs">
          <Link
            href="/jobs"
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            ← All jobs
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {job.title}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">{countLabel(total, filter)}</p>
      </header>

      {(filter !== null || total > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ApplicantsFilterTabs />
          <ApplicantsSortToggle />
        </div>
      )}

      <ApplicantsTable rows={rows} emptyTitle={emptyTitleFor(filter)} />

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} sort={sort} filter={filter}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} sort={sort} filter={filter}>
            Older →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  sort,
  filter,
  children,
}: {
  page: number;
  disabled: boolean;
  sort: SortKey;
  filter: ApplicantFilter | null;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (sort !== 'date') params.set('sort', sort);
  if (filter) params.set('filter', filter);
  return (
    <Link
      href={`?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
