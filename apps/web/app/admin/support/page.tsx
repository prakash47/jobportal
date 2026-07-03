import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import {
  SupportTicketStatusPill,
  type AdminTicketStatus,
} from '../../../components/admin/SupportTicketStatusPill';

// Admin Help & Support ticket queue. Lives entirely under the isolated /admin
// subtree (requireAdmin() in the layout 404s non-admins) — no job-seeker code is
// touched. Reads the AdminGuard'd API with the admin's forwarded cookie.

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const CATEGORY_LABELS: Record<string, string> = {
  ACCOUNT: 'Account',
  JOB_POSTING: 'Job posting',
  APPLICANTS: 'Applicants',
  VERIFICATION: 'Verification',
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  OTHER: 'Other',
};

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

interface TicketListItem {
  id: number;
  subject: string;
  category: string;
  status: AdminTicketStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  user: { id: number; name: string; email: string };
  company: { id: number; name: string };
}

interface TicketListResult {
  items: TicketListItem[];
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

async function fetchList(status: string | undefined, page: number): Promise<TicketListResult | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/support/tickets${qs ? '?' + qs : ''}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as TicketListResult;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AdminSupportPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const statusRaw = readParam(sp, 'status');
  const status = FILTERS.some((f) => f.value === statusRaw) ? statusRaw : undefined;
  const pageRaw = Number(readParam(sp, 'page'));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const data = await fetchList(status, page);

  if (!data) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        Could not load support tickets. Refresh and try again.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Support tickets
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Work recruiter-raised tickets: reply, and move them through the workflow.
          </p>
        </div>
        <Link
          href="/admin/support/messages"
          className="text-sm text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
        >
          Contact messages →
        </Link>
      </header>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === status;
          const href = f.value ? `/admin/support?status=${f.value}` : '/admin/support';
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
          <p className="text-sm font-medium text-[var(--color-fg)]">No tickets</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">No tickets match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Raised by</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Msgs</th>
                <th className="px-4 py-2">Raised</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/support/${item.id}`}
                      className="font-medium text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
                    >
                      {item.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.company.name}</td>
                  <td className="px-4 py-3">
                    <div className="text-[var(--color-fg)]">{item.user.name}</div>
                    <div className="text-xs text-[var(--color-fg-subtle)]">{item.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </td>
                  <td className="px-4 py-3">
                    <SupportTicketStatusPill status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.messageCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--color-fg-muted)]">
                    {formatDate(item.createdAt)}
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
      href={`/admin/support?${params.toString()}`}
      className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
    >
      {children}
    </Link>
  );
}
