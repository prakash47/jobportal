import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { AuditLogRow, type AuditLogEntry } from '../../../components/admin/AuditLogRow';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface AuditLogPage {
  hits: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function readPage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function readFlagKey(sp: Record<string, string | string[] | undefined>): string | undefined {
  const raw = Array.isArray(sp['flagKey']) ? sp['flagKey'][0] : sp['flagKey'];
  return raw && raw.length > 0 ? raw : undefined;
}

async function fetchAuditLog(
  page: number,
  flagKey: string | undefined,
): Promise<AuditLogPage | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (flagKey) params.set('flagKey', flagKey);
  const qs = params.toString();
  const url = `${API_URL}/admin/feature-flags/audit-log${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as AuditLogPage;
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = readPage(sp);
  const flagKey = readFlagKey(sp);
  const data = await fetchAuditLog(page, flagKey);

  if (!data) {
    return (
      <div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Could not load the audit log. Refresh and try again.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Audit log
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {data.total === 0
            ? flagKey
              ? `No changes recorded for ${flagKey}.`
              : 'No flag changes have been recorded yet.'
            : `${data.total} ${data.total === 1 ? 'change' : 'changes'}${
                flagKey ? ` for ${flagKey}` : ''
              }, newest first.`}
        </p>
        {flagKey && (
          <p className="pt-1 text-xs">
            <Link
              href="/admin/audit-log?type=feature_flag"
              className="text-[var(--color-fg-muted)] underline hover:text-[var(--color-fg)]"
            >
              Clear filter
            </Link>
          </p>
        )}
      </header>

      {data.hits.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">No changes match</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Try a different flag key or clear the filter.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Flag</th>
                <th className="px-4 py-2">Change</th>
                <th className="px-4 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.hits.map((row) => (
                <AuditLogRow key={row.id} entry={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} flagKey={flagKey}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} flagKey={flagKey}>
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
  flagKey,
  children,
}: {
  page: number;
  disabled: boolean;
  flagKey: string | undefined;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  params.set('type', 'feature_flag');
  params.set('page', String(page));
  if (flagKey) params.set('flagKey', flagKey);
  return (
    <Link
      href={`/admin/audit-log?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
