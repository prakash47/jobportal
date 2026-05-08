import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../../../lib/auth/server-session';
import { ApplicantsTable, type ApplicantRow } from '../../../../../components/jobs/ApplicantsTable';
import { ApplicantsSortToggle } from '../../../../../components/jobs/ApplicantsSortToggle';

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

export default async function ApplicantsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) notFound();

  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);
  const sort = readSort(sp);

  // Owner-scoped lookup. Cross-recruiter access produces 404 (no leak),
  // matching the API ownership pattern.
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, postedById: true, status: true },
  });
  if (!job || job.postedById !== session.sub) notFound();

  const [applicants, total] = await Promise.all([
    prisma.application.findMany({
      where: { jobId },
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
    prisma.application.count({ where: { jobId } }),
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
        <p className="text-sm text-[var(--color-fg-muted)]">
          {total} {total === 1 ? 'applicant' : 'applicants'}
        </p>
      </header>

      {total > 0 && (
        <div className="flex items-center justify-end">
          <ApplicantsSortToggle />
        </div>
      )}

      <ApplicantsTable rows={rows} />

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} sort={sort}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} sort={sort}>
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
  children,
}: {
  page: number;
  disabled: boolean;
  sort: SortKey;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (sort !== 'date') params.set('sort', sort);
  return (
    <Link
      href={`?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
