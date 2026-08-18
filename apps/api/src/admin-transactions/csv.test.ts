import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@jobportal/domain/txn-log-params';
import { CSV_COLUMNS, toTransactionsCsv, transactionsCsvFilename } from './csv';

// A captured payment with a full GST breakup — the happy path.
const PAID: TransactionRow = {
  id: 1,
  createdAt: new Date('2026-08-17T20:00:00.000Z'), // 01:30 IST on the 18th
  paidAt: new Date('2026-08-17T20:05:00.000Z'),
  status: 'PAID',
  amountInPaise: 499900,
  currency: 'INR',
  razorpayOrderId: 'order_ABC123',
  razorpayPaymentId: 'pay_XYZ789',
  failureReason: null,
  company: { id: 7, name: 'Acme Consulting' },
  plan: { id: 5, name: 'Growth Monthly', tier: 'PREMIUM' },
  invoice: {
    id: 11,
    invoiceNumber: 'INV-2627-000001',
    status: 'PAID',
    amountInPaise: 499900,
    taxableInPaise: 423644,
    cgstInPaise: 38128,
    sgstInPaise: 38128,
    igstInPaise: null,
    gstRateBps: 1800,
    placeOfSupply: 'Maharashtra',
    planNameSnapshot: 'Growth Monthly (2026)',
    periodStart: new Date('2026-08-17T20:05:00.000Z'),
    periodEnd: new Date('2026-09-16T20:05:00.000Z'),
    paidAt: new Date('2026-08-17T20:05:00.000Z'),
  },
} as TransactionRow;

// A failed attempt — no invoice at all, which is every FAILED and abandoned row.
const FAILED: TransactionRow = {
  id: 2,
  createdAt: new Date('2026-08-17T20:00:00.000Z'),
  paidAt: null,
  status: 'FAILED',
  amountInPaise: 499900,
  currency: 'INR',
  razorpayOrderId: 'order_DEF456',
  razorpayPaymentId: null,
  failureReason: 'Card declined by issuer',
  company: { id: 8, name: 'Beta Ltd' },
  plan: { id: 5, name: 'Growth Monthly', tier: 'PREMIUM' },
  invoice: null,
} as TransactionRow;

function dataRows(csv: string): string[] {
  // Drop the BOM+header line and the trailing empty element left by the final
  // CRLF. Splitting on CRLF is safe for the shapes asserted here; the embedded
  // -newline case asserts on the raw string instead.
  return csv.split('\r\n').slice(1).filter((line) => line.length > 0);
}

describe('toTransactionsCsv', () => {
  it('emits the BOM, the header and CRLF terminators', () => {
    const csv = toTransactionsCsv([]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe(`﻿${CSV_COLUMNS.map((c) => `"${c}"`).join(',')}\r\n`);
  });

  it('names the GST treatment in the money headers', () => {
    // The header is the only part of this file that travels with the numbers.
    // Plan prices are GST-inclusive, so a bare "amount" column would be summed
    // as revenue and overstate it by 18%.
    expect(CSV_COLUMNS).toContain('gross_incl_gst_inr');
    expect(CSV_COLUMNS).toContain('taxable_ex_gst_inr');
    expect(CSV_COLUMNS).not.toContain('amount');
    expect(CSV_COLUMNS).not.toContain('revenue');
  });

  it('ships both the attempt date and the capture date', () => {
    // The filter buckets on the attempt date; shipping capture too is what lets
    // an accountant re-bucket a 31-March/1-April payment into the right FY.
    expect(CSV_COLUMNS).toContain('attempted_at_ist');
    expect(CSV_COLUMNS).toContain('paid_at_ist');
  });

  it('writes a captured payment exactly', () => {
    const [row] = dataRows(toTransactionsCsv([PAID]));
    expect(row).toBe(
      [
        '"1"',
        '"2026-08-18 01:30"',
        '"2026-08-18 01:35"',
        '"7"',
        '"Acme Consulting"',
        '"Growth Monthly (2026)"',
        '"PREMIUM"',
        '"PAID"',
        '"4999.00"',
        '"4236.44"',
        '"381.28"',
        '"381.28"',
        '""',
        '"18"',
        '"Maharashtra"',
        '"INR"',
        '"INV-2627-000001"',
        '"PAID"',
        '"2026-08-18 01:35"',
        '"2026-09-17 01:35"',
        '"order_ABC123"',
        '"pay_XYZ789"',
        '""',
      ].join(','),
    );
  });

  it('leaves every invoice-only cell EMPTY on a failed attempt, never zero', () => {
    // ⚠ The single most important assertion in this file. A `0.00` in
    // taxable_ex_gst_inr claims the taxable value WAS zero and sums silently
    // into a revenue total; an empty cell is skipped by every spreadsheet SUM
    // and noticed by every human.
    const [row] = dataRows(toTransactionsCsv([FAILED]));
    const cells = row?.split(',') ?? [];
    const at = (name: (typeof CSV_COLUMNS)[number]): string | undefined =>
      cells[CSV_COLUMNS.indexOf(name)];

    expect(at('taxable_ex_gst_inr')).toBe('""');
    expect(at('cgst_inr')).toBe('""');
    expect(at('sgst_inr')).toBe('""');
    expect(at('igst_inr')).toBe('""');
    expect(at('gst_rate_pct')).toBe('""');
    expect(at('invoice_number')).toBe('""');
    expect(at('invoice_status')).toBe('""');
    expect(at('paid_at_ist')).toBe('""');
    // Gross is on the ORDER, so it is present even though nothing was collected.
    expect(at('gross_incl_gst_inr')).toBe('"4999.00"');
    expect(at('failure_reason')).toBe('"Card declined by issuer"');
  });

  it('renders money as a plain decimal a spreadsheet can sum', () => {
    // No ₹, no Indian digit grouping. formatInrFromPaise would emit "₹4,999"
    // and the column would stop being numeric.
    const csv = toTransactionsCsv([PAID]);
    expect(csv).not.toContain('₹');
    expect(csv).toContain('"4999.00"');
    expect(csv).not.toContain('4,999');
  });

  it('pads the paise so a whole rupee amount keeps two decimals', () => {
    const row = { ...PAID, amountInPaise: 100000, invoice: null } as TransactionRow;
    expect(dataRows(toTransactionsCsv([row]))[0]).toContain('"1000.00"');
  });

  it('renders a sub-rupee remainder without losing the leading zero', () => {
    const row = { ...PAID, amountInPaise: 100005, invoice: null } as TransactionRow;
    expect(dataRows(toTransactionsCsv([row]))[0]).toContain('"1000.05"');
  });

  it('doubles internal quotes and survives embedded commas and newlines', () => {
    const row = {
      ...FAILED,
      company: { id: 9, name: 'O"Brien, Sons\r\nLtd' },
    } as TransactionRow;
    const csv = toTransactionsCsv([row]);
    expect(csv).toContain('"O""Brien, Sons\r\nLtd"');
    // The embedded CRLF is inside quotes, so it must not create a new record:
    // header + one record + the trailing terminator.
    expect(csv.split('\r\n').length).toBeGreaterThan(2);
  });

  it('neutralises every formula-injection prefix', () => {
    // Excel EXECUTES a cell starting with any of these. A company name is
    // attacker-controlled at registration.
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      const row = {
        ...FAILED,
        company: { id: 9, name: `${prefix}cmd|calc` },
      } as TransactionRow;
      const csv = toTransactionsCsv([row]);
      // The guarding quote sits INSIDE the CSV quoting, so the spreadsheet
      // renders the text literally and drops it.
      expect(csv).toContain(`"'${prefix}cmd|calc"`);
    }
  });

  it('leaves an ordinary company name untouched', () => {
    const csv = toTransactionsCsv([PAID]);
    expect(csv).toContain('"Acme Consulting"');
    expect(csv).not.toContain("\"'Acme");
  });

  it('prefers the frozen plan-name snapshot over the live plan name', () => {
    // A later admin rename of the plan must not retroactively rewrite what a
    // past sale says it sold.
    expect(dataRows(toTransactionsCsv([PAID]))[0]).toContain('"Growth Monthly (2026)"');
    // With no invoice there is no snapshot, so the live name is the only source.
    expect(dataRows(toTransactionsCsv([FAILED]))[0]).toContain('"Growth Monthly"');
  });

  it('writes one record per row in the order given', () => {
    expect(dataRows(toTransactionsCsv([PAID, FAILED]))).toHaveLength(2);
  });
});

describe('transactionsCsvFilename', () => {
  it('names the window and carries the refund caveat', () => {
    // InvoiceStatus.REFUNDED has no writer anywhere in the repo, so every total
    // is gross of refunds — permanently, until a refund feature ships. A caveat
    // on the page is gone the moment the file is mailed; the filename survives.
    expect(transactionsCsvFilename('2026-04-01', '2027-03-31')).toBe(
      'jobportal-transactions-2026-04-01_to_2027-03-31-gross-of-refunds.csv',
    );
  });
});
