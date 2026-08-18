// Transaction & Revenue Log reads.
//
// Reads/writes split (the repo's topology): these screens are display-only, so
// every row comes straight from Postgres via Prisma inside the RSC — the same
// call lib/subscriptions/queries.ts and lib/job-postings/queries.ts make.
//
// ⚠ Reads ONLY. The CSV export goes through apps/api
// (POST /admin/transactions/export) so AdminGuard, the
// killswitch.admin_transaction_export flag and the BILLING_TRANSACTIONS_EXPORTED
// audit row all apply. A `prisma.paymentOrder.findMany()` here wired to a route
// handler — or a server action wrapping one — would bypass all three, and this
// file is exactly the convenient place to do it.
//
// ⚠ The where-clause comes from @jobportal/domain, NOT from a local builder.
// The export imports the same one. A second implementation here is how the
// downloaded file starts disagreeing with the screen.

import { prisma, type Prisma } from '@jobportal/db';
import {
  TRANSACTIONS_PAGE_SIZE,
  TRANSACTION_SELECT,
  type TransactionRow,
  type TransactionTab,
  istDayEndExclusiveUtc,
  istDayStartUtc,
  transactionWhere,
} from '@jobportal/domain/txn-log-params';

export type { TransactionRow };

export interface TransactionListPage {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TransactionTotals {
  /** Gross charged, GST-INCLUSIVE, over captured payments only. */
  grossPaidInPaise: number;
  /** Pre-tax value over captured payments only. Excludes rows with no figure. */
  taxableInPaise: number;
  paidCount: number;
  /** Captured payments whose invoice carries no taxable figure. */
  nullTaxableCount: number;
  failedCount: number;
  pendingCount: number;
}

interface Filter {
  tab: TransactionTab;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
}

/**
 * One page of the ledger.
 *
 * The same `where` object is passed BY REFERENCE to both `findMany` and
 * `count`, so the total, the pagination link count and the over-range redirect
 * can never disagree with the visible rows.
 */
export async function listTransactions(
  page: number,
  filter: Filter,
): Promise<TransactionListPage> {
  const where = transactionWhere(filter);
  const pageSize = TRANSACTIONS_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      // ⚠ The id tiebreak is mandatory, not tidiness. Seeded and bulk-created
      // rows share a createdAt to the millisecond, and offset pagination over an
      // unstable sort silently drops and duplicates rows across the page seam.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: TRANSACTION_SELECT,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

/**
 * The honesty strip above the table — computed over the WHOLE filter, not the
 * visible page, because a per-page total on a financial screen is a number
 * nobody wants and everybody misreads.
 *
 * ⚠ Only PAID attempts contribute money. Summing gross across every status
 * would book declined cards and abandoned checkouts as revenue, which is the
 * single most likely way this page could lie.
 *
 * ⚠ Gross and taxable are returned SEPARATELY and neither is called "revenue".
 * Plan prices are GST-inclusive (gst.ts back-computes the taxable value from
 * the total), so one figure labelled revenue and sourced from `amountInPaise`
 * would overstate by exactly 18%.
 */
export async function getTransactionTotals(filter: Filter): Promise<TransactionTotals> {
  // ⚠ Every figure below ignores the tab's status predicate, deliberately. The
  // strip describes the selected RANGE (and search), so the totals must not
  // change meaning when an admin clicks the Failed tab to look at something
  // else — a "gross charged" that silently became zero because the Failed tab
  // is open would be read as a platform outage.
  //
  // The range and the search ARE honoured, which is why this is
  // `{ ...filter, tab: 'ALL' }` rather than an empty filter.
  const rangeWhere = transactionWhere({ ...filter, tab: 'ALL' });
  const paidWhere: Prisma.PaymentOrderWhereInput = {
    AND: [rangeWhere, { status: 'PAID' }],
  };

  const [gross, taxable, byStatus] = await Promise.all([
    prisma.paymentOrder.aggregate({
      where: paidWhere,
      _sum: { amountInPaise: true },
      _count: { _all: true },
    }),
    prisma.subscriptionInvoice.aggregate({
      where: { paymentOrder: paidWhere },
      _sum: { taxableInPaise: true },
      // _count on a NULLABLE column counts NON-NULLS, which is exactly the
      // number needed to expose the null-skipping SUM below.
      _count: { taxableInPaise: true },
    }),
    prisma.paymentOrder.groupBy({
      by: ['status'],
      where: rangeWhere,
      _count: { _all: true },
    }),
  ]);

  // Pre-zeroed for EVERY enum member, so adding a PaymentOrderStatus is a
  // compile error here rather than a bucket that silently vanishes from the
  // strip. Same shape as lib/employers/queries.ts's status fold.
  const counts: Record<Prisma.PaymentOrderGroupByOutputType['status'], number> = {
    CREATED: 0,
    PAID: 0,
    FAILED: 0,
  };
  for (const group of byStatus) counts[group.status] = group._count._all;

  const paidCount = gross._count._all;
  const taxableKnownCount = taxable._count.taxableInPaise;

  return {
    grossPaidInPaise: gross._sum.amountInPaise ?? 0,
    taxableInPaise: taxable._sum.taxableInPaise ?? 0,
    paidCount,
    // The gap the caveat line reports. Without it the taxable total understates
    // with nothing on screen to say so.
    nullTaxableCount: Math.max(0, paidCount - taxableKnownCount),
    failedCount: counts.FAILED,
    pendingCount: counts.CREATED,
  };
}

/**
 * Invoices in the range that name no payment order.
 *
 * ⚠ The PaymentOrder spine is mandatory (an invoice-first query cannot see a
 * FAILED attempt) but it is blind the other way: `SubscriptionInvoice
 * .paymentOrderId` is nullable and the schema comment reserves it for "future
 * candidate-side invoicing". Such an invoice would never appear in this ledger
 * at all. Structurally impossible today — zero rows, and the only writer sets
 * it — so this is cheap insurance that a future feature does not quietly fall
 * out of the accounting view. Surfaced as a caveat only when non-zero.
 */
export async function countOrphanInvoices(
  from?: string | undefined,
  to?: string | undefined,
): Promise<number> {
  const createdAt: Prisma.DateTimeFilter = {};
  if (from !== undefined) createdAt.gte = istDayStartUtc(from);
  if (to !== undefined) createdAt.lt = istDayEndExclusiveUtc(to);

  return prisma.subscriptionInvoice.count({
    where: {
      paymentOrderId: null,
      ...(from !== undefined || to !== undefined ? { createdAt } : {}),
    },
  });
}

/** One transaction for the detail page, or null. */
export async function getTransaction(id: number): Promise<TransactionRow | null> {
  return prisma.paymentOrder.findUnique({ where: { id }, select: TRANSACTION_SELECT });
}
