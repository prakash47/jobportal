import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import {
  SupportTicketStatusPill,
  type AdminTicketStatus,
} from '../../../../components/admin/SupportTicketStatusPill';
import { SupportTicketActions } from '../../../../components/admin/SupportTicketActions';

// Admin ticket detail + thread. Isolated /admin subtree. The reply/status
// mutations are the AdminGuard'd API (this is the UI for it).

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

interface TicketMessage {
  id: number;
  authorId: number;
  fromSupport: boolean;
  body: string;
  createdAt: string;
}

interface TicketDetail {
  id: number;
  subject: string;
  description: string;
  category: string;
  status: AdminTicketStatus;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: number; name: string; email: string };
  company: { id: number; name: string; slug: string };
  messages: TicketMessage[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchDetail(id: string): Promise<TicketDetail | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_URL}/admin/support/tickets/${id}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as TicketDetail;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function AdminSupportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await fetchDetail(id);

  if (!data) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/support"
          className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline"
        >
          ← Back to tickets
        </Link>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Ticket not found, or it could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/support"
          className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline"
        >
          ← Back to tickets
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {data.subject}
          </h1>
          <SupportTicketStatusPill status={data.status} />
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          #{data.id} · {CATEGORY_LABELS[data.category] ?? data.category} · {data.company.name} ·
          Raised by {data.user.name} &lt;{data.user.email}&gt; · {formatDateTime(data.createdAt)}
        </p>
        {(data.resolvedAt || data.closedAt) && (
          <p className="text-xs text-[var(--color-fg-subtle)]">
            {data.resolvedAt && <>Resolved {formatDateTime(data.resolvedAt)}. </>}
            {data.closedAt && <>Closed {formatDateTime(data.closedAt)}.</>}
          </p>
        )}
      </header>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
          {data.user.name} wrote
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{data.description}</p>
      </section>

      {data.messages.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-[var(--color-fg)]">Conversation</h2>
          <ul className="space-y-4">
            {data.messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-md border p-4 ${
                  m.fromSupport
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-muted)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--color-fg)]">
                    {m.fromSupport ? 'Support' : data.user.name}
                  </span>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {formatDateTime(m.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SupportTicketActions ticketId={data.id} status={data.status} />
    </div>
  );
}
