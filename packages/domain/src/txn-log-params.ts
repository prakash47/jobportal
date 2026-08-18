// Param parsing, IST date-boundary arithmetic and the Prisma where/select for
// the Transaction & Revenue Log (/sadmin/transactions).
//
// ⚠ WHY THIS LIVES IN packages/domain RATHER THAN apps/sadmin/lib/transactions/
//
// Every other /sadmin console keeps its pure logic in its own app-local `lib/`,
// and that is the right default. This one cannot, because it has TWO consumers
// that must answer the same question identically:
//
//   1. the list page  — a Prisma-direct RSC read in apps/sadmin
//   2. the CSV export — apps/api/src/admin-transactions (audited, AdminGuard'd)
//
// If the export re-implemented the where-clause, the downloaded file and the
// screen would answer the same filter differently — and because nobody ever
// cross-checks a spreadsheet against a browser tab, that divergence would be
// invisible indefinitely while an accountant booked from it. This package's own
// package.json states the purpose exactly: "Imported by apps/web (SSR) and
// apps/api (REST) so the two cannot drift."
//
// So `transactionWhere` and `TRANSACTION_SELECT` are defined ONCE, here, and
// imported by both. Do not copy either into an app.
//
// No JSX, no `new Date()` — anything needing "now" takes it as an argument.

import type { Prisma } from '@jobportal/db';

/** Transactions per page. Matches every other table in this portal. */
export const TRANSACTIONS_PAGE_SIZE = 20;

// ============================================================
// IST calendar days
// ============================================================

// Prisma stores DateTime as `timestamp WITHOUT time zone` holding UTC, but the
// admin typing a date into this console means an INDIAN calendar day, and the
// invoice sequence this ledger reports on is already FY-scoped in IST
// (invoice-number.ts: "a naive getMonth()/getFullYear() would misfile every
// capture between 00:00 and 05:30 IST").
//
// Shift by +05:30 and read UTC fields, matching invoice-number.ts's istParts.
// Safe as fixed epoch-millisecond arithmetic because India has no DST — the
// same reasoning billing-period.ts's addDays records.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD`, the shape an `<input type="date">` submits. */
const IST_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a `YYYY-MM-DD` day string, returning it unchanged or `undefined`.
 *
 * The regex ALONE is not enough: it happily accepts `2026-02-31` and
 * `2026-13-01`. `Date.parse` on an ISO date string is lenient in a way that
 * silently rolls those over (2026-02-31 → 3 March), so the parsed date is
 * round-tripped back to `YYYY-MM-DD` and compared — a rollover no longer
 * matches its own input and is rejected.
 *
 * Degrades to `undefined` rather than throwing, because this parses a URL
 * param: a hand-edited, bookmarked or truncated `?from=` must render the
 * unfiltered page, never a 500. The page then reports that it ignored the
 * range — see formatTransactionsSummary — because silently dropping a filter
 * an admin can see in their own address bar is how a wrong number gets trusted.
 */
export function parseIstDay(raw: string | string[] | undefined): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return undefined;
  const trimmed = first.trim();
  if (!IST_DAY_RE.test(trimmed)) return undefined;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Rollover check: 2026-02-31 parses to 2026-03-03 and fails this.
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : undefined;
}

/** The UTC instant at which the given IST calendar day begins (00:00:00 IST). */
export function istDayStartUtc(day: string): Date {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
}

/**
 * The UTC instant at which the given IST calendar day ENDS, EXCLUSIVE — i.e.
 * the start of the next IST day.
 *
 * ⚠ Exclusive, and never `T23:59:59`. A `lte` on 23:59:59 drops every row in
 * the final second of the range; a `lte` on 23:59:59.999 drops sub-millisecond
 * precision Postgres is perfectly capable of storing. `lt` the next midnight is
 * the only form with no gap.
 */
export function istDayEndExclusiveUtc(day: string): Date {
  return new Date(istDayStartUtc(day).getTime() + DAY_MS);
}

/** Whole days spanned by an inclusive IST day range — `from === to` is 1. */
export function istDaySpan(from: string, to: string): number {
  return Math.round((istDayStartUtc(to).getTime() - istDayStartUtc(from).getTime()) / DAY_MS) + 1;
}

/**
 * `YYYY-MM-DD HH:mm` in IST, for CSV cells.
 *
 * Deliberately NOT the display formatter from apps/sadmin/lib/jobs/format.ts:
 * that one renders for humans reading a page ("18 Aug 2026, 4:12 pm"), which a
 * spreadsheet cannot sort or filter as a date. This form sorts lexicographically
 * and every column that uses it carries an `_ist` name suffix so the timezone is
 * never in doubt in a file that has left the building.
 */
export function formatIstTimestamp(value: Date): string {
  const shifted = new Date(value.getTime() + IST_OFFSET_MS);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

// ============================================================
// Tabs
// ============================================================

/**
 * The tabs, in render order.
 *
 * ALL is FIRST and is the default, which is the opposite of every other console
 * in this portal — and deliberate. The others open onto the question they exist
 * to answer ("who is on a paid plan right now"). A payment ledger opened onto a
 * filtered subset is how someone reads a total, believes it is the total, and
 * books it. Nobody should ever be looking at this page without knowing that
 * they are looking at everything.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing:
 * parseTransactionTab validates by MEMBERSHIP against this array, never by
 * indexing an object with the raw param. `?status=__proto__` indexing a plain
 * object returns a truthy inherited value and would sail through an
 * `if (MAP[raw])` check — the exact prototype-chain class this repo has already
 * shipped a HIGH for on the SRP.
 */
export const TRANSACTION_TABS = ['ALL', 'PAID', 'FAILED', 'PENDING'] as const;
export type TransactionTab = (typeof TRANSACTION_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_TRANSACTION_TAB: TransactionTab = 'ALL';

export const TRANSACTION_TAB_LABEL: Record<TransactionTab, string> = {
  ALL: 'All attempts',
  PAID: 'Captured',
  FAILED: 'Failed',
  PENDING: 'Pending',
};

export function parseTransactionTab(raw: string | string[] | undefined): TransactionTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_TRANSACTION_TAB;
  const upper = first.trim().toUpperCase();
  // Membership against the tuple — never `SOME_MAP[upper]`. See TRANSACTION_TABS.
  return (TRANSACTION_TABS as readonly string[]).includes(upper)
    ? (upper as TransactionTab)
    : DEFAULT_TRANSACTION_TAB;
}

// ============================================================
// Search
// ============================================================

/**
 * LIKE-wildcard escaping.
 *
 * ⚠ A COPY of apps/sadmin/lib/job-postings/format.ts's `escapeLikePattern`, and
 * it has to be: packages/* cannot import from apps/*. The sadmin console
 * re-exports THIS one rather than making a third copy, so there are exactly two
 * definitions in the repo and the app-side surfaces all funnel here.
 * Consolidating the job-postings original into this module is a follow-up —
 * doing it in this branch would change the search semantics of two shipped
 * consoles mid-feature.
 *
 * Backslash MUST be escaped first, or the escapes added for % and _ get
 * double-escaped by the backslash pass and stop working.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// ============================================================
// The query
// ============================================================

export interface TransactionFilter {
  tab: TransactionTab;
  /** Inclusive IST calendar day, `YYYY-MM-DD`. */
  from?: string | undefined;
  /** Inclusive IST calendar day, `YYYY-MM-DD`. */
  to?: string | undefined;
  q?: string | undefined;
}

/**
 * The where-clause, shared verbatim by the list page and the CSV export.
 *
 * ⚠ THE SPINE IS PaymentOrder, NOT SubscriptionInvoice, and that is mandatory
 * rather than a preference. The schema has no `subscriptionId` on PaymentOrder;
 * the link runs the other way through the NULLABLE
 * `SubscriptionInvoice.paymentOrderId`. An invoice-first query therefore cannot
 * see a single FAILED or abandoned CREATED attempt — precisely the rows a
 * payment-status filter exists to surface. (PROGRESS.md 2026-08-15 recorded this
 * as a hard requirement when the feature was first deferred.)
 *
 * Composed as an `AND` ARRAY rather than one merged object: both the `q` clause
 * and the PENDING clause are `OR`/`NOT` shapes, and a single object literal can
 * hold only one `OR` key — merging them would silently drop a filter.
 */
export function transactionWhere(filter: TransactionFilter): Prisma.PaymentOrderWhereInput {
  const and: Prisma.PaymentOrderWhereInput[] = [];

  // Tab. PAID and FAILED are exact; PENDING is the NEGATION of the two terminal
  // states rather than `status: 'CREATED'`, so a PaymentOrderStatus member added
  // later surfaces in a tab instead of falling out of every one of them. ALL
  // omits the key ENTIRELY — never `status: undefined`, which Prisma treats as
  // a filter on the field in some positions.
  if (filter.tab === 'PAID') and.push({ status: 'PAID' });
  else if (filter.tab === 'FAILED') and.push({ status: 'FAILED' });
  else if (filter.tab === 'PENDING') and.push({ NOT: { status: { in: ['PAID', 'FAILED'] } } });

  // Date range, bucketed on `createdAt` (the ATTEMPT date).
  //
  // ⚠ createdAt, not paidAt — owner decision 2026-08-18. paidAt is NULL on every
  // FAILED and every abandoned row, so bucketing on it would make those rows
  // vanish from every date range and quietly gut the status filter. The export
  // ships BOTH dates as columns so an accountant can re-bucket on capture date
  // in the spreadsheet; this matters at exactly one moment and matters a lot —
  // a checkout started 31 March and captured 1 April books into different
  // financial years depending which date you pick.
  //
  // A one-sided range is honoured: `from` with no `to` is "everything since".
  if (filter.from !== undefined || filter.to !== undefined) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filter.from !== undefined) createdAt.gte = istDayStartUtc(filter.from);
    if (filter.to !== undefined) createdAt.lt = istDayEndExclusiveUtc(filter.to);
    and.push({ createdAt });
  }

  // Free-text. Company name is what staff actually search by; the invoice number
  // is what an accountant arrives holding; the two gateway ids are what a
  // Razorpay dashboard row gives you. All four escaped — without it `?q=%`
  // matches every payment on the platform.
  if (filter.q) {
    const contains = escapeLikePattern(filter.q);
    and.push({
      OR: [
        { company: { name: { contains, mode: 'insensitive' } } },
        { invoice: { invoiceNumber: { contains, mode: 'insensitive' } } },
        { razorpayOrderId: { contains, mode: 'insensitive' } },
        { razorpayPaymentId: { contains, mode: 'insensitive' } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

/**
 * The single shared Prisma `select` — the list, the detail page and the CSV all
 * read the same columns, so a field can never render on screen and be missing
 * from the file (or vice versa).
 *
 * `invoice: { select: ... }` on the optional back-relation IS the LEFT JOIN:
 * Prisma emits it as a left join and yields `invoice: null` for an attempt that
 * never produced one, which is exactly every FAILED and every abandoned row.
 *
 * `satisfies` rather than a type annotation so the literal keeps its literal
 * type — a plain `: Prisma.PaymentOrderSelect` would widen it and lose the
 * inference that makes the row type flow through to the callers.
 */
export const TRANSACTION_SELECT = {
  id: true,
  createdAt: true,
  paidAt: true,
  status: true,
  amountInPaise: true,
  currency: true,
  razorpayOrderId: true,
  razorpayPaymentId: true,
  failureReason: true,
  company: { select: { id: true, name: true } },
  plan: { select: { id: true, name: true, tier: true } },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      amountInPaise: true,
      taxableInPaise: true,
      cgstInPaise: true,
      sgstInPaise: true,
      igstInPaise: true,
      gstRateBps: true,
      placeOfSupply: true,
      planNameSnapshot: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
    },
  },
} satisfies Prisma.PaymentOrderSelect;

/** One ledger row, as read by all three consumers. */
export type TransactionRow = Prisma.PaymentOrderGetPayload<{ select: typeof TRANSACTION_SELECT }>;
