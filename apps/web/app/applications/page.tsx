import { prisma, type ApplicationStatus, type Prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { Pagination } from '../../components/dashboard/Pagination';
import {
  ApplicationRow,
  ApplicationsEmpty,
  StatusFilter,
} from '../../components/applications';
import type { HistoryEntry } from '../../components/applications/StatusTimeline';

const PAGE_SIZE = 20;

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

function readStatus(sp: Record<string, string | string[] | undefined>): ApplicationStatus | null {
  const raw = Array.isArray(sp['status']) ? sp['status'][0] : sp['status'];
  if (!raw || raw === 'ALL') return null;
  if (VALID_STATUSES.has(raw)) return raw as ApplicationStatus;
  return null;
}

// statusHistory is a Prisma JSON column; narrow it to the entry shape the API
// writes ({from,to,at,by} appended per transition) and drop anything else.
// The guard takes `unknown` (not JsonValue) because HistoryEntry has no index
// signature and so is not assignable to Prisma's JsonObject.
function isHistoryEntry(e: unknown): e is HistoryEntry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as Record<string, unknown>)['to'] === 'string' &&
    typeof (e as Record<string, unknown>)['at'] === 'string'
  );
}

function parseHistory(raw: Prisma.JsonValue | null): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const e of raw) {
    if (isHistoryEntry(e)) out.push(e);
  }
  return out;
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);
  const status = readStatus(sp);

  const where: Prisma.ApplicationWhereInput = { userId: session.sub };
  if (status) where.status = status;

  const [rows, total, grouped] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { appliedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        statusHistory: true,
        job: {
          select: {
            title: true,
            canonicalSlug: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.application.count({ where }),
    // Per-status chip counts are always the unfiltered totals.
    prisma.application.groupBy({
      by: ['status'],
      where: { userId: session.sub },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  let all = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    all += g._count._all;
  }
  counts['ALL'] = all;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={
          total === 0
            ? filtered
              ? 'Nothing matches this filter.'
              : 'You have not applied to anything yet.'
            : `${total} ${total === 1 ? 'application' : 'applications'}.`
        }
      />

      <StatusFilter counts={counts} />

      {rows.length === 0 ? (
        <ApplicationsEmpty filtered={filtered} />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <ApplicationRow
              key={r.id}
              id={r.id}
              status={r.status}
              appliedAtIso={r.appliedAt.toISOString()}
              history={parseHistory(r.statusHistory)}
              job={r.job}
            />
          ))}
        </ContentCard>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        baseHref="/applications"
        {...(status ? { params: { status } } : {})}
      />
    </div>
  );
}
