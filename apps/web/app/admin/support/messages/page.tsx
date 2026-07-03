import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';

// Admin Contact-Us message list. Read-only — the durable record of every
// "Contact us" submission. Isolated /admin subtree.

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  user: { id: number; email: string } | null;
}

interface ContactListResult {
  items: ContactMessage[];
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

async function fetchList(page: number): Promise<ContactListResult | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/support/contact-messages${qs ? '?' + qs : ''}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as ContactListResult;
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

export default async function AdminContactMessagesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pageRaw = Number(readParam(sp, 'page'));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const data = await fetchList(page);

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
          Could not load contact messages. Refresh and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/support"
          className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline"
        >
          ← Back to tickets
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Contact messages
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          One-off messages sent from the recruiter Contact us form.
        </p>
      </header>

      {data.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">No messages</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Contact us submissions will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {data.items.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-[var(--color-fg)]">{m.subject}</span>
                  <span className="ml-2 text-xs text-[var(--color-fg-muted)]">
                    {m.name} &lt;{m.email}&gt;
                  </span>
                </div>
                <span className="text-xs text-[var(--color-fg-subtle)]">
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{m.message}</p>
            </li>
          ))}
        </ul>
      )}

      {data.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/support/messages?page=${page - 1}`}
              className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
            >
              ← Newer
            </Link>
          ) : (
            <span className="text-[var(--color-fg-subtle)]">← Newer</span>
          )}
          <span className="text-[var(--color-fg-muted)]">
            Page {page} of {data.totalPages}
          </span>
          {page < data.totalPages ? (
            <Link
              href={`/admin/support/messages?page=${page + 1}`}
              className="text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
            >
              Older →
            </Link>
          ) : (
            <span className="text-[var(--color-fg-subtle)]">Older →</span>
          )}
        </nav>
      )}
    </div>
  );
}
