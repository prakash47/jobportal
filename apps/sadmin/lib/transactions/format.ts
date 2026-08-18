// Pure logic for the Transaction & Revenue Log — labels, URL building and the
// result summary. No JSX, no Prisma, and no `new Date()`: anything that needs
// "now" takes it as an argument, so the tests are deterministic. Same
// discipline as lib/subscriptions/format.ts and lib/job-postings/format.ts.

import type { InvoiceStatus, PaymentOrderStatus } from '@jobportal/db';
import {
  DEFAULT_TRANSACTION_TAB,
  type TransactionTab,
} from '@jobportal/domain/txn-log-params';

export { TRANSACTIONS_PAGE_SIZE } from '@jobportal/domain/txn-log-params';

// The offset-pagination and `?q` rules every table in this portal obeys,
// re-exported rather than copied for the reason lib/subscriptions/format.ts
// spells out: two clamps that disagree is a silently wrong ?page on one table
// and not the other.
export { clampPage, lastPageFor } from '../employers/format';
export { firstParam, normalizeQuery } from '../candidates/format';

// The tab, date and where-clause helpers come from packages/domain rather than
// living here, because the CSV export in apps/api imports the SAME ones. That
// is the whole reason this feature has a shared module — see the header of
// packages/domain/src/txn-log-params.ts.
export {
  DEFAULT_TRANSACTION_TAB,
  TRANSACTION_TABS,
  TRANSACTION_TAB_LABEL,
  parseIstDay,
  parseTransactionTab,
  transactionWhere,
  type TransactionTab,
} from '@jobportal/domain/txn-log-params';

/**
 * Labels for a payment attempt's status.
 *
 * `Record<PaymentOrderStatus, string>`, never `Record<string, string>` — keyed
 * by the Prisma enum, a missing or invented member is a compile error rather
 * than raw SCREAMING_SNAKE rendered to staff.
 *
 * ⚠ CREATED reads "Pending", matching
 * apps/recruiter/components/billing/PaymentHistoryTable.tsx, which shows the
 * SAME row to the company whose payment it is. Two surfaces naming one payment
 * differently is worse than either word being individually preferable.
 */
export const PAYMENT_STATUS_LABEL: Record<PaymentOrderStatus, string> = {
  CREATED: 'Pending',
  PAID: 'Captured',
  FAILED: 'Failed',
};

/**
 * Labels for an invoice's status.
 *
 * ⚠ Only PAID is ever produced today. `activatePaidOrder` writes the literal
 * 'PAID' and it is the only code path in the repo that creates a
 * SubscriptionInvoice at all — PENDING, FAILED and REFUNDED have NO writer
 * anywhere. REFUNDED in particular is why every total on this console is gross
 * of refunds: a refund issued from the Razorpay dashboard leaves this database
 * completely unchanged. They are all labelled anyway so that the day one of
 * them acquires a writer, this console renders it as a word rather than an
 * enum member.
 */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

/**
 * Whether a captured payment is missing its invoice.
 *
 * Structurally unexpected: the invoice is written in the SAME transaction as
 * the activation, so a PAID order without one means that transaction did not
 * complete as designed. Worth surfacing rather than rendering as an ordinary
 * blank — see the detail page's branching empty state.
 */
export function isMissingExpectedInvoice(row: {
  status: PaymentOrderStatus;
  invoice: unknown | null;
}): boolean {
  return row.status === 'PAID' && row.invoice === null;
}

/**
 * Shared by the status tabs, the date filter, the pagination links AND the
 * over-range redirect, so no two of them can build different URLs for the same
 * state.
 *
 * ⚠ It does NOT preserve unknown params by construction, so EVERY param the
 * page reads must be an argument here — `from` and `to` included. Omitting them
 * would mean clicking a status tab silently wipes the admin's date range, which
 * on a financial screen means the next number they read covers a different
 * period than the one they think they are looking at.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/transactions'
 * here would resolve to /sadmin/sadmin/transactions.
 */
export function transactionsHref(
  tab: TransactionTab,
  page: number,
  from?: string | undefined,
  to?: string | undefined,
  q?: string | undefined,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TRANSACTION_TAB) params.set('status', tab);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : '/transactions';
}

/**
 * Link from a row to that transaction's detail page, carrying the list state so
 * Back returns to the exact filtered page the admin left. Carries the typed
 * params rather than a free-form `?returnTo=` URL, which would be an
 * open-redirect surface.
 */
export function transactionDetailHref(
  id: number,
  tab: TransactionTab,
  page: number,
  from?: string | undefined,
  to?: string | undefined,
  q?: string | undefined,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TRANSACTION_TAB) params.set('status', tab);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/transactions/${id}?${qs}` : `/transactions/${id}`;
}

/** Singular/plural nouns per tab, keyed by the union so a new tab is a compile error. */
const TAB_NOUN: Record<TransactionTab, { one: string; many: string }> = {
  ALL: { one: 'payment attempt', many: 'payment attempts' },
  PAID: { one: 'captured payment', many: 'captured payments' },
  FAILED: { one: 'failed attempt', many: 'failed attempts' },
  PENDING: { one: 'pending attempt', many: 'pending attempts' },
};

/**
 * The sentence in the page's live region — what a screen-reader user hears when
 * the results change, and the only description of what is on screen.
 *
 * The empty copy must not over-claim. "No payment attempts have been recorded
 * yet" is only honest on the ALL tab with no filters; with a filter applied the
 * right statement is that nothing MATCHES, which is a different fact. Getting
 * this wrong on a financial screen tells an admin the platform has taken no
 * money when in fact they are looking at a Tuesday.
 *
 * `rangeIgnored` says so out loud. Silently dropping a date filter the admin
 * can see in their own address bar is how a number covering the wrong period
 * gets trusted — worse than either swapping the dates or erroring.
 */
export function formatTransactionsSummary(
  total: number,
  tab: TransactionTab,
  from?: string | undefined,
  to?: string | undefined,
  q?: string | undefined,
  rangeIgnored = false,
): string {
  const noun = TAB_NOUN[tab];
  const scope: string[] = [];
  if (q) scope.push(`matching “${q}”`);
  if (from && to) scope.push(`between ${from} and ${to}`);
  else if (from) scope.push(`on or after ${from}`);
  else if (to) scope.push(`on or before ${to}`);

  const suffix = scope.length > 0 ? ` ${scope.join(' ')}` : '';
  const warning = rangeIgnored
    ? ' The date range was ignored because its end is before its start.'
    : '';

  if (total === 0) {
    const nothing =
      scope.length > 0 || tab !== DEFAULT_TRANSACTION_TAB
        ? `No ${noun.many} found${suffix}.`
        : 'No payment attempts have been recorded yet.';
    return nothing + warning;
  }

  const label = total === 1 ? noun.one : noun.many;
  return `${total.toLocaleString('en-IN')} ${label}${suffix}.` + warning;
}

/**
 * The taxable total's caveat line, or null when there is nothing to warn about.
 *
 * ⚠ This exists because `SubscriptionInvoice.taxableInPaise` is NULLABLE and a
 * Postgres `SUM` skips nulls silently. Without this count, the gross total would
 * be right while the taxable total quietly understated, gross − taxable would no
 * longer equal the GST collected, and nothing would error or look wrong. The
 * number is the only thing that makes the gap visible.
 */
export function taxableCaveat(paidCount: number, nullTaxableCount: number): string | null {
  if (nullTaxableCount === 0) return null;
  const one = nullTaxableCount === 1;
  const subject = one ? 'payment has' : 'payments have';
  // The object has to agree with the subject too. "1 … payment has … excludes
  // them" reads as a typo, and a sentence that reads as a typo is one a reader
  // skims past — on the one line whose whole job is to stop them trusting a
  // total that is missing rows.
  const object = one ? 'it' : 'them';
  return `${nullTaxableCount.toLocaleString('en-IN')} of ${paidCount.toLocaleString('en-IN')} captured ${subject} no taxable figure recorded, so the taxable total below excludes ${object}.`;
}

/** Basis points as a percentage string: 1800 → "18%". */
export function formatGstRate(bps: number | null): string {
  return bps === null ? '—' : `${bps / 100}%`;
}
