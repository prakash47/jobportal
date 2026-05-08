import Link from 'next/link';
import { prisma, type JobStatus, type Prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { JobRow } from '../../../components/jobs/JobRow';
import { JobsStatusFilter } from '../../../components/jobs/JobsStatusFilter';

const PAGE_SIZE = 20;

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'PENDING_MODERATION',
  'ACTIVE',
  'EXPIRED',
  'CLOSED',
]);

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function readStatus(sp: Record<string, string | string[] | undefined>): JobStatus | null {
  const raw = Array.isArray(sp['status']) ? sp['status'][0] : sp['status'];
  if (!raw || raw === 'ALL') return null;
  if (VALID_STATUSES.has(raw)) return raw as JobStatus;
  return null;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);
  const status = readStatus(sp);

  const where: Prisma.JobWhereInput = { postedById: session.sub };
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        status: true,
        postedAt: true,
        expiresAt: true,
        _count: { select: { applications: true } },
      },
    }),
    prisma.job.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Jobs</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {total === 0
              ? filtered
                ? 'Nothing matches this filter.'
                : 'You haven’t posted any jobs yet.'
              : `${total} ${total === 1 ? 'job' : 'jobs'}.`}
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/jobs/new">Post a job</Link>
        </Button>
      </header>

      <JobsStatusFilter />

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {filtered ? 'Nothing matches this filter' : 'No jobs yet'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {filtered ? 'Try a different status or clear the filter.' : 'Post your first opening.'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4">
          {rows.map((r) => (
            <JobRow
              key={r.id}
              id={r.id}
              title={r.title}
              status={r.status}
              postedAt={r.postedAt}
              expiresAt={r.expiresAt}
              applicantCount={r._count.applications}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} status={status}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} status={status}>
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
  status,
  children,
}: {
  page: number;
  disabled: boolean;
  status: JobStatus | null;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (status) params.set('status', status);
  return (
    <Link
      href={`/jobs?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
