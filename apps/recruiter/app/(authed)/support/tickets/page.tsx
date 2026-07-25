import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../../lib/auth/require-recruiter';
import { RaiseTicketDialog } from '../../../../components/support/RaiseTicketDialog';
import { TicketStatusBadge } from '../../../../components/support/TicketStatusBadge';
import { CATEGORY_LABELS } from '../../../../components/support/ticket-labels';

// Help & Support → Raise a ticket. Lists the recruiter's own tickets (creator-
// scoped, read direct via Prisma) and hosts the "Raise a ticket" dialog. L2
// killswitch gate; the create/reply/close mutations go through the BFF (L3).

export const dynamic = 'force-dynamic';

const TH =
  'border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]';
const TD = 'border-b border-[var(--color-border)] px-3 py-2.5 align-top';

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function TicketsPage() {
  if (await isFlagEnabled('killswitch.recruiter_help_support')) notFound();
  const user = await requireRecruiter();

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Support tickets
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Track issues you&rsquo;ve raised and pick up the conversation with our team.
          </p>
        </div>
        <RaiseTicketDialog />
      </header>

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">No tickets yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-fg-muted)]">
            Raise a ticket when you hit a problem you want us to track. You&rsquo;ll see replies and
            status updates here.
          </p>
          <div className="mt-4 flex justify-center">
            <RaiseTicketDialog />
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Ticket</th>
                <th className={TH}>Category</th>
                <th className={TH}>Status</th>
                <th className={TH}>Raised</th>
                <th className={TH}>Last update</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--color-bg-muted)]">
                  <td className={TD}>
                    <Link
                      href={`/support/tickets/${t.id}`}
                      className="font-medium text-[var(--color-fg)] hover:underline"
                    >
                      {t.subject}
                    </Link>
                    <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                      #{t.id}
                      {t._count.messages > 0
                        ? ` · ${t._count.messages} ${t._count.messages === 1 ? 'reply' : 'replies'}`
                        : ''}
                    </span>
                  </td>
                  <td className={`${TD} text-[var(--color-fg-muted)]`}>
                    {CATEGORY_LABELS[t.category]}
                  </td>
                  <td className={TD}>
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[var(--color-fg-muted)]`}>
                    {fmtDate(t.createdAt)}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[var(--color-fg-muted)]`}>
                    {fmtDate(t.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
