import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { KycStatusPill, type AdminKycStatus } from '../../../components/admin/KycStatusPill';

// Admin Company-Verification (KYC) review queue. Lives entirely under the
// isolated /admin subtree (requireAdmin() in the layout 404s non-admins) — no
// job-seeker code is touched. Reads the API with the admin's forwarded cookie.

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const FILTERS = [
  { value: undefined, label: 'All submitted' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

interface KycListItem {
  companyId: number;
  companyName: string;
  companySlug: string;
  legalName: string | null;
  gstNumberMasked: string | null;
  status: AdminKycStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  documentCount: number;
}

interface KycListResult {
  items: KycListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readParam(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const raw = Array.isArray(sp[key]) ? sp[key]?.[0] : sp[key];
  return raw && raw.length > 0 ? raw : undefined;
}

async function fetchList(status: string | undefined, page: number): Promise<KycListResult | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/kyc${qs ? '?' + qs : ''}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as KycListResult;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function KycReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const statusRaw = readParam(sp, 'status');
  const status = FILTERS.some((f) => f.value === statusRaw) ? statusRaw : undefined;
  const pageRaw = Number(readParam(sp, 'page'));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const data = await fetchList(status, page);

  if (!data) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        Could not load verification submissions. Refresh and try again.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Company verification
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Review recruiter KYC submissions and approve or reject company verification.
        </p>
      </header>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === status;
          const href = f.value ? `/admin/kyc-review?status=${f.value}` : '/admin/kyc-review';
          return (
            <Link
              key={f.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-3 py-1 text-sm font-medium text-[var(--color-fg)]'
                  : 'rounded-md border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]'
              }
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {data.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">Nothing to review</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            No submissions match this filter.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">GSTIN</th>
                <th className="px-4 py-2">Docs</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.companyId} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--color-fg)]">{item.companyName}</div>
                    {item.legalName && (
                      <div className="text-xs text-[var(--color-fg-subtle)]">{item.legalName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-fg-muted)]">
                    {item.gstNumberMasked ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.documentCount}</td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatDate(item.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <KycStatusPill status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/kyc-review/${item.companyId}`}
                      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <PageLink status={status} page={page - 1} disabled={page <= 1}>
            ← Newer
          </PageLink>
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {data.totalPages}
          </span>
          <PageLink status={status} page={page + 1} disabled={page >= data.totalPages}>
            Older →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  status,
  page,
  disabled,
  children,
}: {
  status: string | undefined;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-[var(--color-fg-subtle)]">{children}</span>;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  return (
    <Link
      href={`/admin/kyc-review?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
