import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { formatDateTimeIst } from '../../../lib/jobs/format';
import { formatInrFromPaise } from '../../../lib/subscriptions/format';
import {
  PAYMENT_STATUS_LABEL,
  TRANSACTION_TABS,
  TRANSACTION_TAB_LABEL,
  clampPage,
  firstParam,
  formatTransactionsSummary,
  lastPageFor,
  normalizeQuery,
  parseIstDay,
  parseTransactionTab,
  taxableCaveat,
  transactionDetailHref,
  transactionsHref,
  type TransactionTab,
} from '../../../lib/transactions/format';
import {
  countOrphanInvoices,
  getTransactionTotals,
  listTransactions,
  type TransactionRow,
  type TransactionTotals,
} from '../../../lib/transactions/queries';
import { DateRangeFilter } from '../../../components/transactions/DateRangeFilter';
import { ExportCsvButton } from '../../../components/transactions/ExportCsvButton';
import { TransactionSearchBar } from '../../../components/transactions/TransactionSearchBar';
import { requireAdminScope } from '../../../lib/auth/require-super-admin';

export const metadata: Metadata = {
  title: 'Transaction & Revenue Log — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it: a REPEATED key (`?q=a&q=b`) arrives as an
// ARRAY, so every param goes through firstParam / parse*. Typing these as bare
// strings is what let an array reach `raw.trim()` and 500 the sibling
// /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    from?: string | string[];
    to?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  // Layer 2 scope gate for this route segment — see
  // lib/roles/scope-map.ts. The (authed) layout only proves the caller is
  // active staff; this proves they hold THIS module. Load-bearing because
  // the reads below hit Postgres directly and never reach AdminGuard.
  await requireAdminScope('finance', 'READ_ONLY');

  const sp = await searchParams;
  const tab = parseTransactionTab(sp.status);
  const rawFrom = parseIstDay(sp.from);
  const rawTo = parseIstDay(sp.to);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  // A backwards range is DROPPED, not swapped and not 500'd — and the summary
  // sentence says so out loud. Swapping would silently answer a question the
  // admin did not ask; erroring would take down the ledger over a typo in a
  // bookmarked URL. Saying "I ignored it" is the only option that cannot mislead
  // someone into trusting a figure covering the wrong period.
  const rangeIgnored = rawFrom !== undefined && rawTo !== undefined && rawFrom > rawTo;
  const from = rangeIgnored ? undefined : rawFrom;
  const to = rangeIgnored ? undefined : rawTo;

  const filter = { tab, from, to, q };

  const [result, totals, orphanInvoices, exportKilled] = await Promise.all([
    listTransactions(page, filter),
    getTransactionTotals(filter),
    countOrphanInvoices(from, to),
    // Layer 2 of the flag gate: disable the control the API would refuse anyway.
    // Deliberately does NOT gate the route — killing the export must not blind
    // staff to what was paid. Layer 3 in AdminTransactionsService is the
    // enforcement point (CLAUDE.md §4).
    isFlagEnabled('killswitch.admin_transaction_export'),
  ]);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No payment attempts found" would be a lie, and the count, table and
  // pagination all live in the non-empty branch — leaving an admin on a dead end
  // with no control to get back.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404. This is why /candidates, /employers, /jobs,
  // /job-postings, /otp-sessions, /reports and /subscriptions all lack one: a
  // constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(transactionsHref(tab, lastPage, from, to, q));
  }

  const isEmpty = result.rows.length === 0;
  const summary = formatTransactionsSummary(result.total, tab, from, to, q, rangeIgnored);
  const caveat = taxableCaveat(totals.paidCount, totals.nullTaxableCount);

  return (
    <div data-wide className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Transaction &amp; Revenue Log
          </h1>
          <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
            Every payment attempt on the platform — captured, failed and pending — with the GST
            breakup of each invoice. Figures are gross of refunds.
          </p>
        </div>
        <ExportCsvButton tab={tab} from={from} to={to} q={q} exportKilled={exportKilled} />
      </header>

      {/* Reads the master purchase switch rather than hardcoding "billing is
          off", so the sentence stays true the day someone turns it on. */}
      <LedgerStateNotice />

      <TotalsStrip totals={totals} caveat={caveat} />

      {orphanInvoices > 0 && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
          {orphanInvoices.toLocaleString('en-IN')} invoice
          {orphanInvoices === 1 ? '' : 's'} in this range name no payment attempt and are therefore
          not listed below. This ledger is spined on payment attempts, so an invoice raised without
          one cannot appear in it.
        </p>
      )}

      {/* Status tabs. Each link carries the active search AND the active date
          range, so switching tabs narrows rather than resets. */}
      <nav
        aria-label="Filter by payment status"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
      >
        {TRANSACTION_TABS.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={transactionsHref(t, 1, from, to, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {TRANSACTION_TAB_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      {/* ⚠ The RAW parsed dates, not the sanitised ones. When the range is
          backwards the QUERY drops it (from/to become undefined), but the
          params are still sitting in the admin's address bar — so showing the
          inputs as empty would leave them looking at an unfiltered page with no
          visible cause and no control to clear. The summary sentence says the
          range was ignored; these inputs show WHICH range, and "Clear dates"
          stays available to fix it. */}
      <DateRangeFilter from={rawFrom} to={rawTo} />
      <TransactionSearchBar />

      {/* ONE always-mounted live region carrying the result summary. The search
          bar and the date filter both commit with router.replace(..., { scroll:
          false }), so results swap in place: focus never moves, the pathname and
          <title> are unchanged, and Next's route announcer (which diffs the
          title) therefore says nothing. It must be ONE element that always
          renders and only changes its TEXT — a role="status" that mounts
          together with its message does not announce. */}
      <p
        role="status"
        className={
          isEmpty
            ? 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]'
            : 'text-sm text-[var(--color-fg-muted)]'
        }
      >
        {summary}
      </p>

      {!isEmpty && (
        <>
          {/* The table scrolls inside its own card rather than the document —
              the app shell locks the viewport (h-screen + overflow-hidden) and
              scrolls each pane independently. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Attempted (IST)
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Plan
                  </th>
                  {/* Both money columns name their GST treatment in the header.
                      Plan prices are GST-inclusive, so a column called just
                      "Amount" would be read as revenue and overstate by 18%. */}
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Gross (incl. GST)
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Taxable (ex-GST)
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Invoice
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Captured (IST)
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <TransactionTableRow
                    key={row.id}
                    row={row}
                    tab={tab}
                    page={result.page}
                    from={from}
                    to={to}
                    q={q}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            tab={tab}
            page={result.page}
            total={result.total}
            pageSize={result.pageSize}
            from={from}
            to={to}
            q={q}
          />
        </>
      )}
    </div>
  );
}

// Reads the master purchase switch rather than hardcoding "billing is off": the
// sentence has to stay true the day someone turns it on. Without it, an empty
// ledger reads as a fault rather than as the expected state of a closed
// storefront.
async function LedgerStateNotice() {
  const purchasingOn = await isFlagEnabled('subscription.system.enabled');
  if (purchasingOn) return null;
  return (
    <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
      Recruiters cannot currently buy a plan — <code>subscription.system.enabled</code> is off, so
      the storefront is closed and no new payment can be attempted. An empty ledger is expected
      rather than a fault. Note this records <strong>gateway payments only</strong>: a plan comped by
      staff moves no money and issues no invoice, so it appears on{' '}
      <Link href="/subscriptions" className="underline hover:no-underline">
        Subscriptions &amp; Billing
      </Link>{' '}
      and never here.
    </p>
  );
}

/**
 * Gross and taxable side by side, with neither labelled "Revenue".
 *
 * That is the point of the component. Plan prices are GST-inclusive, so a single
 * headline figure sourced from `amountInPaise` overstates by exactly 18% — the
 * specific error this feature was deferred over. Two labelled figures make the
 * gap between them visible instead of hidden.
 */
function TotalsStrip({ totals, caveat }: { totals: TransactionTotals; caveat: string | null }) {
  return (
    <section
      aria-label="Totals for the current filter"
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Gross charged (incl. GST)"
          value={formatInrFromPaise(totals.grossPaidInPaise)}
          hint={`${totals.paidCount.toLocaleString('en-IN')} captured`}
          emphasis
        />
        <Figure
          label="Taxable (ex-GST)"
          value={formatInrFromPaise(totals.taxableInPaise)}
          hint="Pre-tax value of captured payments"
          emphasis
        />
        {/* Failed and pending are counted, never summed into money. A pending
            attempt is not a receivable: nothing expires or sweeps abandoned
            checkouts, so a two-year-old one still sits here as "Pending". */}
        <Figure
          label="Failed"
          value={totals.failedCount.toLocaleString('en-IN')}
          hint="Declined or errored, no money taken"
        />
        <Figure
          label="Pending"
          value={totals.pendingCount.toLocaleString('en-IN')}
          hint="Started and never completed — not money owed"
        />
      </dl>

      {caveat && (
        <p className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-fg-muted)]">
          {caveat}
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd
        className={`tabular-nums ${
          emphasis
            ? 'text-xl font-semibold text-[var(--color-fg)]'
            : 'text-xl font-medium text-[var(--color-fg)]'
        }`}
      >
        {value}
      </dd>
      <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p>
    </div>
  );
}

function TransactionTableRow({
  row,
  tab,
  page,
  from,
  to,
  q,
}: {
  row: TransactionRow;
  tab: TransactionTab;
  page: number;
  from: string | undefined;
  to: string | undefined;
  q: string | undefined;
}) {
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3 tabular-nums text-[var(--color-fg)]">
        {formatDateTimeIst(row.createdAt)}
      </td>

      <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{row.company.name}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {/* The invoice's frozen plan name wins over the live one: a later admin
            rename must not retroactively rewrite what a past sale sold. */}
        <span className="block text-[var(--color-fg)]">
          {row.invoice?.planNameSnapshot ?? row.plan.name}
        </span>
        <span className="mt-0.5 block text-xs">{row.plan.tier}</span>
      </td>

      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
        {formatInrFromPaise(row.amountInPaise)}
      </td>

      {/* ⚠ An em dash, NEVER ₹0. A zero here asserts the taxable value WAS zero;
          the dash says it is not recorded, which is the truth for every failed
          and every abandoned attempt. */}
      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
        {row.invoice?.taxableInPaise == null ? '—' : formatInrFromPaise(row.invoice.taxableInPaise)}
      </td>

      <td className="px-4 py-3">
        <StatusPill status={row.status} />
      </td>

      <td className="px-4 py-3 tabular-nums text-[var(--color-fg-muted)]">
        {row.invoice?.invoiceNumber ?? '—'}
      </td>

      <td className="px-4 py-3 tabular-nums text-[var(--color-fg-muted)]">
        {row.paidAt === null ? '—' : formatDateTimeIst(row.paidAt)}
      </td>

      <td className="px-4 py-3">
        {/* Self-describing out of context: twenty links all named "View" is what
            a screen-reader user hears when listing this page's controls. The
            visible word stays FIRST so voice control still matches "click View"
            (WCAG 2.5.3 Label in Name). */}
        <Link
          href={transactionDetailHref(row.id, tab, page, from, to, q)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          View
          <span className="sr-only"> transaction {row.razorpayOrderId} for {row.company.name}</span>
        </Link>
      </td>
    </tr>
  );
}

// A neutral pill. Captured is distinguished by WEIGHT AND FOREGROUND, not hue —
// --color-success on --color-bg-muted measures 2.76:1, below the 4.5:1 AA floor
// for 12px text, and it shipped on the job-postings pill before being fixed the
// same way. Failed is the one state worth a colour, using the darkened danger
// token (raw --color-danger measures 4.41:1 on this surface, under the floor).
function StatusPill({ status }: { status: TransactionRow['status'] }) {
  const captured = status === 'PAID';
  const failed = status === 'FAILED';
  const tone = captured
    ? 'font-medium text-[var(--color-fg)]'
    : failed
      ? 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]'
      : 'text-[var(--color-fg-muted)]';
  return (
    <span className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${tone}`}>
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

function Pagination({
  tab,
  page,
  total,
  pageSize,
  from,
  to,
  q,
}: {
  tab: TransactionTab;
  page: number;
  total: number;
  pageSize: number;
  from: string | undefined;
  to: string | undefined;
  q: string | undefined;
}) {
  const lastPage = lastPageFor(total, pageSize);
  if (lastPage === 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--color-fg-muted)]">
        Page {page} of {lastPage}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={transactionsHref(tab, page - 1, from, to, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={transactionsHref(tab, page + 1, from, to, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
