import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { SavedJobRow, SavedJobsEmpty } from '../../components/saved-jobs';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// SRS §4.4 — paginated saved-jobs dashboard. Lookup happens server-side via
// Prisma so the page is one round-trip; the API list endpoint exists for
// programmatic / future-mobile clients.
async function loadSavedJobsPage(userId: number, page: number) {
  const [savedRows, total] = await Promise.all([
    prisma.savedJob.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
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
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.savedJob.count({ where: { userId } }),
  ]);

  const jobIds = savedRows.map((r) => r.jobId);
  const applications = jobIds.length
    ? await prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true, status: true },
      })
    : [];
  const appliedByJobId = new Map<number, string>();
  for (const a of applications) appliedByJobId.set(a.jobId, a.status);

  return {
    rows: savedRows.map((r) => ({
      ...r,
      applied: appliedByJobId.has(r.jobId),
      appliedStatus: appliedByJobId.get(r.jobId) ?? null,
    })),
    total,
  };
}

export default async function SavedJobsPage({ searchParams }: PageProps) {
  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);

  const { rows, total } = await loadSavedJobsPage(session.sub, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Saved jobs</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {total === 0
            ? 'Nothing saved yet.'
            : `${total} ${total === 1 ? 'role' : 'roles'} bookmarked.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <SavedJobsEmpty />
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4">
          {rows.map((r) => (
            <SavedJobRow
              key={r.jobId}
              jobId={r.jobId}
              savedAt={r.savedAt}
              job={r.job}
              applied={r.applied}
              appliedStatus={r.appliedStatus}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages}>
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
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  }
  return (
    <Link
      href={`/saved-jobs?page=${page}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
