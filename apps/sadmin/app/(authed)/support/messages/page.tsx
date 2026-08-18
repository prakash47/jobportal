import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '../../../../lib/auth/require-super-admin';
import { formatDateTimeIst } from '../../../../lib/jobs/format';
import {
  clampPage,
  contactMessagesHref,
  firstParam,
  lastPageFor,
  supportHref,
} from '../../../../lib/support/format';
import { listContactMessages, pageSizeOf } from '../../../../lib/support/queries';
import type { ContactMessage } from '../../../../lib/support/types';

export const metadata: Metadata = {
  title: 'Contact messages — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function ContactMessagesPage({ searchParams }: PageProps) {
  // Explicit, as on the ticket detail: this page renders submitter names and
  // email addresses, including from people with no account.
  await requireSuperAdmin();

  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));

  const result = await listContactMessages(page);

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Header />
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg)]"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const data = result.data;
  const pageSize = pageSizeOf(data);

  // Same over-range rule as the ticket queue — see the comment there, including
  // why this segment must not gain a loading.tsx.
  if (page > 1 && data.items.length === 0 && data.total > 0) {
    const lastPage = lastPageFor(data.total, pageSize);
    if (page > lastPage) redirect(contactMessagesHref(lastPage));
  }

  const lastPage = lastPageFor(data.total, pageSize);

  return (
    <div className="space-y-6">
      <BackLink />
      <Header />

      <p
        role="status"
        className={
          data.items.length === 0
            ? 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]'
            : 'text-sm text-[var(--color-fg-muted)]'
        }
      >
        {data.total === 0
          ? 'No contact messages have been sent yet.'
          : `${data.total.toLocaleString('en-IN')} contact ${data.total === 1 ? 'message' : 'messages'}`}
      </p>

      {data.items.length > 0 && (
        <ul className="space-y-4">
          {data.items.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
          <span className="text-sm text-[var(--color-fg-muted)]">
            Page {data.page} of {lastPage}
          </span>
          <span className="flex gap-2">
            {data.page > 1 && (
              <Link
                href={contactMessagesHref(data.page - 1)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
              >
                Previous
              </Link>
            )}
            {data.page < lastPage && (
              <Link
                href={contactMessagesHref(data.page + 1)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
              >
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={supportHref('OPEN', 1)}
      className="rounded text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      ← Back to tickets
    </Link>
  );
}

function Header() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
        Contact messages
      </h1>
      {/* States the two things staff would otherwise have to discover the hard
          way: these are NOT tickets (no status, no thread, no reply from here),
          and answering means email. SupportContactMessage carries no status,
          assignee or note column — giving it any would be a schema change. */}
      <p className="text-sm text-[var(--color-fg-muted)]">
        One-off submissions from the recruiter &ldquo;Contact us&rdquo; form. These are a read-only
        record — they have no status and no reply thread, so answering one means emailing the
        sender directly.
      </p>
    </header>
  );
}

function MessageCard({ message }: { message: ContactMessage }) {
  return (
    <li className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-[var(--color-fg)]">{message.subject}</span>
          <span className="ml-2 text-xs text-[var(--color-fg-muted)]">
            {message.name} ({message.email})
          </span>
        </div>
        <span className="text-xs text-[var(--color-fg-muted)]">
          {formatDateTimeIst(message.createdAt)}
        </span>
      </div>
      {/* The submitted email may differ from the account's — the form prefills
          from the session but stays editable, and userId is SetNull so the record
          outlives the account. Showing the account address only when it differs
          keeps the common case quiet and the mismatch visible. */}
      {message.user && message.user.email !== message.email && (
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          Signed in as {message.user.email}
        </p>
      )}
      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{message.message}</p>
    </li>
  );
}
