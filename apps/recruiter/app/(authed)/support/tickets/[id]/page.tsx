import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../../../lib/auth/require-recruiter';
import { TicketStatusBadge } from '../../../../../components/support/TicketStatusBadge';
import { TicketThreadActions } from '../../../../../components/support/TicketThreadActions';
import { CATEGORY_LABELS } from '../../../../../components/support/ticket-labels';

// Help & Support → a single ticket thread. Creator-scoped: a ticket that is
// missing OR belongs to another user both 404 (no probing). Reads direct via
// Prisma; reply/close mutations go through the BFF (TicketThreadActions).

export const dynamic = 'force-dynamic';

const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (await isFlagEnabled('killswitch.recruiter_help_support')) notFound();
  const user = await requireRecruiter();

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId < 1) notFound();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket || ticket.userId !== user.sub) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/support/tickets"
          className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:underline"
        >
          &larr; Back to tickets
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {ticket.subject}
          </h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          #{ticket.id} · {CATEGORY_LABELS[ticket.category]} · Raised {fmtDateTime(ticket.createdAt)}
        </p>
      </header>

      {/* Original problem statement. */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
          You wrote
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">
          {ticket.description}
        </p>
      </section>

      {/* Reply thread. */}
      {ticket.messages.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-[var(--color-fg)]">Conversation</h2>
          <ul className="space-y-4">
            {ticket.messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg border p-4 ${
                  m.fromSupport
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-muted)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--color-fg)]">
                    {m.fromSupport ? 'Support' : 'You'}
                  </span>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {fmtDateTime(m.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-fg)]">{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TicketThreadActions ticketId={ticket.id} status={ticket.status} />
    </div>
  );
}
