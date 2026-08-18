import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '../../../../lib/auth/require-super-admin';
import { formatDateTimeIst } from '../../../../lib/jobs/format';
import {
  clampPage,
  firstParam,
  formatNoteAuthor,
  formatNotesSummary,
  formatSupportCategory,
  formatSupportStatus,
  normalizeQuery,
  parseSupportTab,
  supportHref,
} from '../../../../lib/support/format';
import { getTicket } from '../../../../lib/support/queries';
import type { TicketDetail, TicketMessage, TicketNote } from '../../../../lib/support/types';
import { SupportTicketActions } from '../../../../components/support/SupportTicketActions';
import { InternalNoteForm } from '../../../../components/support/InternalNoteForm';

export const metadata: Metadata = {
  title: 'Ticket — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function SupportTicketDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. The layout does
  // call requireSuperAdmin(), but this file could be moved out from under it and
  // silently lose the check — and this route renders a recruiter's identity, the
  // full support thread, and staff's private notes about them.
  await requireSuperAdmin();

  const { id } = await params;
  const sp = await searchParams;

  // Strict coercion. A digits-only test rejects the hex and exponent forms
  // Number() would accept, and the int4 ceiling matters: a larger value would
  // make the API 400 where a 404 is the honest answer for an id that cannot name
  // a row. Same guard as /reports/[id] and /job-postings/[id].
  const ticketId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(ticketId) || ticketId < 1) notFound();
  if (ticketId > 2_147_483_647) notFound();

  // The list state the admin came from, so Back returns to the exact filtered
  // page rather than an unfiltered page 1. Decoded by the same helpers that
  // encoded it on the queue.
  const backHref = supportHref(
    parseSupportTab(sp.status),
    clampPage(firstParam(sp.page)),
    normalizeQuery(firstParam(sp.q)),
  );

  const result = await getTicket(ticketId);

  // A genuinely missing ticket is a 404; anything else (API down, session
  // expired) keeps its own message. Collapsing the two would tell staff a ticket
  // does not exist because the API was restarting.
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="space-y-6">
        <BackLink href={backHref} />
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg)]"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const ticket = result.data;

  return (
    <div className="space-y-8">
      <BackLink href={backHref} />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {ticket.subject}
          </h1>
          <span className="inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs font-medium text-[var(--color-fg)]">
            {formatSupportStatus(ticket.status)}
          </span>
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          #{ticket.id} · {formatSupportCategory(ticket.category)} · {ticket.company.name} · raised by{' '}
          {ticket.user.name} ({ticket.user.email}) · {formatDateTimeIst(ticket.createdAt)}
        </p>
        <Lifecycle ticket={ticket} />
      </header>

      {/* The opening problem statement. Lives on the ticket itself rather than in
          the message thread, so it is rendered as its own block — folding it in
          as "message 1" would make the Replies count on the queue disagree with
          what the thread visibly shows. */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
          {ticket.user.name} wrote
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">
          {ticket.description}
        </p>
      </section>

      {ticket.messages.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">Conversation</h2>
          <ul className="space-y-4">
            {ticket.messages.map((m) => (
              <MessageItem key={m.id} message={m} raiserName={ticket.user.name} />
            ))}
          </ul>
        </section>
      )}

      <SupportTicketActions ticketId={ticket.id} status={ticket.status} />

      {/* Notes render AFTER the reply controls, deliberately. Reading order puts
          the customer-visible action first, so the staff-only panel is arrived at
          as a distinct second thing rather than as another field of the form
          above it. */}
      <NotesSection notes={ticket.notes} />
      <InternalNoteForm ticketId={ticket.id} />
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="rounded text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      ← Back to tickets
    </Link>
  );
}

/**
 * The resolved/closed timestamps.
 *
 * Both are rendered when both are set, which is the normal end state of a ticket
 * (RESOLVED then CLOSED) and is only truthful because this branch fixed the
 * service: `resolvedAt` used to be nulled on the move to CLOSED, so a completed
 * ticket showed a close time and no resolution time at all.
 */
function Lifecycle({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.resolvedAt && !ticket.closedAt) return null;
  return (
    <p className="text-xs text-[var(--color-fg-muted)]">
      {ticket.resolvedAt && <>Resolved {formatDateTimeIst(ticket.resolvedAt)}. </>}
      {ticket.closedAt && <>Closed {formatDateTimeIst(ticket.closedAt)}.</>}
    </p>
  );
}

function MessageItem({ message, raiserName }: { message: TicketMessage; raiserName: string }) {
  return (
    <li
      className={`rounded-xl border p-4 ${
        message.fromSupport
          ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* Tickets are creator-scoped, so every non-staff message is by the
            raiser — there is no third party to attribute. */}
        <span className="text-sm font-medium text-[var(--color-fg)]">
          {message.fromSupport ? 'Support' : raiserName}
        </span>
        <span className="text-xs text-[var(--color-fg-muted)]">
          {formatDateTimeIst(message.createdAt)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{message.body}</p>
    </li>
  );
}

/**
 * The existing internal notes.
 *
 * Always rendered, including when empty: the summary line states the staff-only
 * audience on every render, and a panel that appears only once a note exists
 * would leave the promise unstated exactly when the first note is being written.
 */
function NotesSection({ notes }: { notes: TicketNote[] }) {
  return (
    <section aria-labelledby="support-notes-heading" className="space-y-3">
      <h2 id="support-notes-heading" className="text-sm font-semibold text-[var(--color-fg)]">
        Internal notes
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)]">{formatNotesSummary(notes.length)}</p>
      {notes.length > 0 && (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              // Dashed + muted, matching InternalNoteForm's panel, so a note is
              // never mistaken at a glance for a message in the thread above.
              className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-[var(--color-fg)]">
                  {formatNoteAuthor(n.author)}
                </span>
                <span className="text-xs text-[var(--color-fg-muted)]">
                  {formatDateTimeIst(n.createdAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
