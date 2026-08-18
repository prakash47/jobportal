import {
  type TransactionRow,
  formatIstTimestamp,
} from '@jobportal/domain/txn-log-params';

// CSV serialisation for the Transaction & Revenue Log export.
//
// Written by hand rather than pulled from papaparse / json2csv / fast-csv: a
// new top-level dependency needs owner review (CLAUDE.md §10) and this is ~60
// lines of well-specified behaviour. There is NO csv code anywhere else in this
// repo — verified by grep across all 14 package.json files — so nothing is
// being duplicated.
//
// The four rules below are what make this file an honest accounting document
// rather than a plausible one. Each has a test.

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * One CSV field, RFC 4180 quoted and neutralised against formula injection.
 *
 * ⚠ RULE 3 — FORMULA INJECTION. Excel, LibreOffice and Sheets all EXECUTE a
 * cell beginning `=`, `+`, `-` or `@` (and a leading tab or CR, which are
 * stripped before that check). A company that names itself
 * `=HYPERLINK("http://evil","refund")` therefore executes inside the file an
 * accountant books from, and a formula can read and rewrite the cells around
 * it — turning a data-integrity problem into a numbers problem. Prefixing a
 * single quote is the standard neutralisation: the spreadsheet renders the text
 * literally and drops the quote.
 *
 * This repo has no escaping helper of any kind to copy — the nearest relatives
 * are `xmlEscape` in the sitemap route and `escapeLikePattern` for SQL LIKE,
 * neither of which applies.
 */
function cell(value: string): string {
  const guarded =
    value.length > 0 && FORMULA_PREFIXES.includes(value.charAt(0)) ? `'${value}` : value;
  // Always quote. Unconditional quoting is simpler to verify than conditional
  // quoting and is valid RFC 4180 for every field, including empty ones.
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Rupees from paise, as a plain decimal for a spreadsheet column.
 *
 * ⚠ RULE 2 — NOT `formatInrFromPaise`. That formatter emits a rupee sign and
 * Indian digit grouping (10,00,000), which a spreadsheet parses as text rather
 * than a number, so the column silently stops summing. Plain `1999.00` with no
 * symbol and no grouping is what a numeric column needs; the header names the
 * unit.
 *
 * Integer arithmetic on the paise value, so no float ever touches a money
 * figure: 199900 paise becomes exactly "1999.00".
 */
function money(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * ⚠ RULE 1 — A NULL MONEY FIELD IS AN EMPTY CELL, NEVER `0.00`.
 *
 * `SubscriptionInvoice.taxableInPaise` is nullable, and the difference matters
 * more than it looks: `0.00` asserts that the taxable value WAS zero, which
 * would be a claim about a real transaction. An empty cell asserts that it is
 * unknown — every spreadsheet SUM skips it rather than pulling the total down,
 * and a human scanning the column notices the gap. A zero is a lie that
 * balances; a blank is a question that gets asked.
 */
function optionalMoney(paise: number | null): string {
  return paise === null ? '' : money(paise);
}

function optionalText(value: string | null): string {
  return value ?? '';
}

function optionalTimestamp(value: Date | null): string {
  return value === null ? '' : formatIstTimestamp(value);
}

/**
 * Column headers, in fixed order.
 *
 * `gross_incl_gst_inr` and `taxable_ex_gst_inr` are SEPARATE columns and both
 * name their GST treatment in the header itself. Plan prices in this product
 * are GST-INCLUSIVE (apps/api/src/recruiter-billing/gst.ts back-computes the
 * taxable value from the total), so a single column called `amount` would be
 * summed as revenue and overstate it by exactly 18%. The header is the only
 * part of this file that travels with the numbers.
 *
 * Both `attempted_at_ist` and `paid_at_ist` ship. The range filter buckets on
 * the attempt date (owner decision — it is the only date present on FAILED and
 * abandoned rows), so shipping the capture date too is what lets an accountant
 * re-bucket by capture in the spreadsheet. That difference decides which
 * financial year a 31-March attempt captured on 1 April belongs to.
 */
export const CSV_COLUMNS = [
  'order_id',
  'attempted_at_ist',
  'paid_at_ist',
  'company_id',
  'company_name',
  'plan_name',
  'plan_tier',
  'payment_status',
  'gross_incl_gst_inr',
  'taxable_ex_gst_inr',
  'cgst_inr',
  'sgst_inr',
  'igst_inr',
  'gst_rate_pct',
  'place_of_supply',
  'currency',
  'invoice_number',
  'invoice_status',
  'period_start_ist',
  'period_end_ist',
  'razorpay_order_id',
  'razorpay_payment_id',
  'failure_reason',
] as const;

/**
 * Excel on Windows assumes the system codepage for a .csv without a byte-order
 * mark, which mangles a company name in Devanagari, Tamil or Bengali. Three
 * bytes to make the file readable by the people who will actually open it.
 *
 * Written as an escape rather than a literal BOM character so the constant
 * survives any tooling that re-encodes this source file.
 */
const UTF8_BOM = '﻿';

/** RFC 4180 specifies CRLF line endings. */
const CRLF = '\r\n';

function row(order: TransactionRow): string {
  const invoice = order.invoice;
  return [
    cell(String(order.id)),
    cell(formatIstTimestamp(order.createdAt)),
    cell(optionalTimestamp(order.paidAt)),
    cell(String(order.company.id)),
    cell(order.company.name),
    // The invoice's frozen plan name wins over the live one: the statutory
    // document records what was sold, and a later admin rename of the plan must
    // not retroactively rewrite a past sale.
    cell(invoice?.planNameSnapshot ?? order.plan.name),
    cell(order.plan.tier),
    cell(order.status),
    // Gross is on the ORDER and is always present — it is what the card was
    // charged, including for a FAILED attempt where nothing was collected.
    cell(money(order.amountInPaise)),
    // Taxable lives only on the invoice, so it is absent for every FAILED and
    // every abandoned row. Empty cell, never zero — see optionalMoney.
    cell(optionalMoney(invoice?.taxableInPaise ?? null)),
    cell(optionalMoney(invoice?.cgstInPaise ?? null)),
    cell(optionalMoney(invoice?.sgstInPaise ?? null)),
    cell(optionalMoney(invoice?.igstInPaise ?? null)),
    // Basis points to percent: 1800 becomes "18". Same empty-not-zero rule.
    cell(invoice?.gstRateBps == null ? '' : String(invoice.gstRateBps / 100)),
    cell(optionalText(invoice?.placeOfSupply ?? null)),
    cell(order.currency),
    cell(optionalText(invoice?.invoiceNumber ?? null)),
    cell(invoice?.status ?? ''),
    cell(optionalTimestamp(invoice?.periodStart ?? null)),
    cell(optionalTimestamp(invoice?.periodEnd ?? null)),
    cell(order.razorpayOrderId),
    cell(optionalText(order.razorpayPaymentId)),
    cell(optionalText(order.failureReason)),
  ].join(',');
}

/** Serialise the ledger rows to an RFC 4180 CSV document. */
export function toTransactionsCsv(rows: readonly TransactionRow[]): string {
  const header = CSV_COLUMNS.map((name) => cell(name)).join(',');
  const body = rows.map(row);
  // Trailing CRLF so the last record is terminated like every other one.
  return UTF8_BOM + [header, ...body].join(CRLF) + CRLF;
}

/**
 * ⚠ RULE 4 — THE REFUND CAVEAT TRAVELS WITH THE FILE.
 *
 * `InvoiceStatus.REFUNDED` exists in the enum and NOTHING in this codebase
 * writes it; `PaymentOrder` has no reversal transition at all. A refund issued
 * from the Razorpay dashboard therefore leaves this database completely
 * unchanged, and every total here is gross of refunds — permanently, until a
 * refund feature ships.
 *
 * A caveat rendered on the page is gone the moment the file is downloaded and
 * mailed, which is the exact moment it starts being trusted. Putting it in the
 * FILENAME is the only place it survives to the person doing the booking.
 *
 * Not a comment line inside the file and not a totals row: both corrupt strict
 * CSV parsing and break every pivot table built on the result.
 */
export function transactionsCsvFilename(from: string, to: string): string {
  return `jobportal-transactions-${from}_to_${to}-gross-of-refunds.csv`;
}
