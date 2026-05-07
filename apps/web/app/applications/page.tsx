import Link from 'next/link';
import { prisma, type ApplicationStatus, type Prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../lib/auth/server-session';
import {
  ApplicationRow,
  ApplicationsEmpty,
  StatusFilter,
} from '../../components/applications';

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

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const session = (await readUserFromCookie())!;
  const sp = await searchParams;
  const page = readPage(sp);
  const status = readStatus(sp);

  const where: Prisma.ApplicationWhereInput = { userId: session.sub };
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { appliedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        appliedAt: true,
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
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Applications
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {total === 0
            ? filtered
              ? 'Nothing matches this filter.'
              : 'You have not applied to anything yet.'
            : `${total} ${total === 1 ? 'application' : 'applications'}.`}
        </p>
      </header>

      <StatusFilter />

      {rows.length === 0 ? (
        <ApplicationsEmpty filtered={filtered} />
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4">
          {rows.map((r) => (
            <ApplicationRow
              key={r.id}
              id={r.id}
              status={r.status}
              appliedAt={r.appliedAt}
              job={r.job}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            status={status}
          >
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            status={status}
          >
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
  status: ApplicationStatus | null;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  }
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (status) params.set('status', status);
  return (
    <Link
      href={`/applications?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
