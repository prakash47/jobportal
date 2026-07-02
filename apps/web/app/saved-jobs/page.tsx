import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { Pagination } from '../../components/dashboard/Pagination';
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
      <PageHeader
        title="Saved jobs"
        description={
          total === 0 ? 'Nothing saved yet.' : `${total} ${total === 1 ? 'role' : 'roles'} bookmarked.`
        }
      />

      {rows.length === 0 ? (
        <SavedJobsEmpty />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)]">
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
        </ContentCard>
      )}

      <Pagination page={page} totalPages={totalPages} baseHref="/saved-jobs" />
    </div>
  );
}
