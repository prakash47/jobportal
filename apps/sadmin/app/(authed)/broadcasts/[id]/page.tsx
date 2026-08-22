import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { ArrowLeft } from '@jobportal/ui/icons';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';
import { formatDateTimeIst } from '../../../../lib/jobs/format';
import {
  BROADCAST_RECIPIENT_STATUS_LABEL,
  broadcastsHref,
  clampPage,
  describeInAppReach,
  firstParam,
  formatBroadcastCategory,
  formatBroadcastSegment,
  formatBroadcastStatus,
  formatChannels,
  formatCount,
  formatDeliverySummary,
  formatPersonName,
  isEditable,
  isInFlight,
  normalizeQuery,
  parseBroadcastTab,
} from '../../../../lib/broadcasts/format';
import { getBroadcast } from '../../../../lib/broadcasts/queries';
import type { BroadcastDetail } from '../../../../lib/broadcasts/types';
import { BroadcastActions } from '../../../../components/broadcasts/BroadcastActions';
import { BroadcastComposer } from '../../../../components/broadcasts/BroadcastComposer';

export const metadata: Metadata = {
  title: 'Broadcast — Career Queue Super Admin',
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

export default async function BroadcastDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. The layout does
  // call requireSuperAdmin(), but this file could be moved out from under it and
  // silently lose the check — and this route renders recipient email addresses.
  await requireAdminScope('communications', 'READ_ONLY');

  const { id } = await params;
  const sp = await searchParams;

  // Strict coercion. A digits-only test rejects the hex and exponent forms
  // Number() would accept, and the int4 ceiling matters: a larger value would
  // make the API 400 where a 404 is the honest answer for an id that cannot name
  // a row. Same guard as /support/[id] and /job-postings/[id].
  const broadcastId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(broadcastId) || broadcastId < 1) notFound();
  if (broadcastId > 2_147_483_647) notFound();

  const backHref = broadcastsHref(
    parseBroadcastTab(sp.status),
    clampPage(firstParam(sp.page)),
    normalizeQuery(firstParam(sp.q)),
  );

  const [result, killed] = await Promise.all([
    getBroadcast(broadcastId),
    isFlagEnabled(FLAG.KILL_ADMIN_BROADCAST_SEND),
  ]);

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

  const b = result.data;
  const editable = isEditable(b.status);
  const inAppNote = describeInAppReach(b.segment, b.inAppEnabled);

  return (
    <div data-wide className="space-y-6">
      <BackLink href={backHref} />

      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {b.subject}
          </h1>
          <span className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs font-medium text-[var(--color-fg)]">
            {formatBroadcastStatus(b.status)}
          </span>
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          #{b.id} · {formatBroadcastCategory(b.category)} · {formatBroadcastSegment(b.segment)} ·{' '}
          {formatChannels(b.emailEnabled, b.inAppEnabled)}
          {b.author ? ` · Composed by ${formatPersonName(b.author)}` : ' · Composed by Unknown admin'}
        </p>
      </header>

      <BroadcastActions broadcast={b} killed={killed} />

      <DeliveryCard broadcast={b} />

      {inAppNote && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
          {inAppNote}
        </p>
      )}

      {editable ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">Edit draft</h2>
          {/* The composer doubles as the editor. Saving an edit clears the test
              send server-side, and the composer says so on success — an admin
              who does not know that would press Send and be refused for a reason
              with no visible cause. */}
          <BroadcastComposer initial={b} />
        </section>
      ) : (
        <MessageCard broadcast={b} />
      )}

      {b.problems.length > 0 && <ProblemsCard broadcast={b} />}
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Back to broadcasts
    </Link>
  );
}

/**
 * What happened when this was sent.
 *
 * Reads from `progress` — the LIVE ledger counts — rather than the rolled-up
 * columns, and says which it is showing. While a broadcast is SENDING the two
 * legitimately differ, and a page that showed the frozen columns during a send
 * would sit at zero while thousands of emails went out.
 */
function DeliveryCard({ broadcast: b }: { broadcast: BroadcastDetail }) {
  if (b.status === 'DRAFT') {
    return (
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
        <p className="text-sm text-[var(--color-fg-muted)]">
          Nothing has been sent yet.{' '}
          {b.testSentAt
            ? `A test copy was sent to you on ${formatDateTimeIst(b.testSentAt)}.`
            : 'No test copy has been sent.'}
        </p>
      </section>
    );
  }

  const live = isInFlight(b.status);
  return (
    <section className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Delivery</h2>
      <p className="text-sm text-[var(--color-fg)]">
        {formatDeliverySummary({
          sent: b.progress.sent,
          skipped: b.progress.skipped,
          failed: b.progress.failed,
          ...(live ? { pending: b.progress.pending } : {}),
        })}
        {b.recipientCount !== null && ` · ${formatCount(b.recipientCount)} addressed`}
      </p>
      <p className="text-xs text-[var(--color-fg-muted)]">
        {/* "Dispatched", not "Sent", and the distinction is real: sentAt is the
            moment the send was handed to the queue, and for a large segment the
            last email lands minutes later. Labelling it "Sent at" would make an
            admin reading a bounce timestamp think the two disagreed. */}
        {b.sentAt && `Dispatched ${formatDateTimeIst(b.sentAt)}. `}
        {b.cancelledAt && `Cancelled ${formatDateTimeIst(b.cancelledAt)}. `}
        {live
          ? 'Still sending — these numbers update as it goes. Refresh to see progress.'
          : 'Final figures.'}
      </p>
    </section>
  );
}

/** The message as it went out. Plain text, never rendered as markup. */
function MessageCard({ broadcast: b }: { broadcast: BroadcastDetail }) {
  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Message</h2>
      {/* whitespace-pre-wrap preserves the paragraph breaks the email renderer
          also honours, so this reads as what was actually delivered rather than
          as one collapsed block. The body is admin free text and is rendered as
          TEXT — never dangerouslySetInnerHTML. */}
      <p className="whitespace-pre-wrap text-sm text-[var(--color-fg)]">{b.body}</p>
      {b.ctaLabel && b.ctaUrl && (
        <p className="text-sm text-[var(--color-fg-muted)]">
          Button: <span className="text-[var(--color-fg)]">{b.ctaLabel}</span> → {b.ctaUrl}
        </p>
      )}
    </section>
  );
}

/**
 * The recipients who did not receive it.
 *
 * Only skipped and failed rows appear. A successful send has thousands of
 * identical delivered rows, and listing them would bury the handful that are
 * worth reading one at a time.
 */
function ProblemsCard({ broadcast: b }: { broadcast: BroadcastDetail }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Not delivered</h2>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {/* The two are named separately because the remedies differ: a skipped
            recipient is an account that no longer exists and needs nothing done,
            while a failed one is an address the provider rejected. */}
        Skipped means the account no longer exists. Failed means the email provider rejected the
        address.
        {b.problemsTruncated && ' Showing the first 100 only.'}
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Recipient
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Outcome
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {b.problems.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-[var(--color-fg)]">{row.email}</td>
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                  {BROADCAST_RECIPIENT_STATUS_LABEL[row.status]}
                </td>
                {/* An em dash rather than an empty cell: a blank reason column
                    reads as missing data rather than as "no reason recorded". */}
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                  {row.statusReason ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
