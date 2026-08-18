import { describe, expect, it } from 'vitest';
import {
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  formatGstRate,
  formatTransactionsSummary,
  isMissingExpectedInvoice,
  taxableCaveat,
  transactionDetailHref,
  transactionsHref,
} from './format';

describe('PAYMENT_STATUS_LABEL', () => {
  it('names CREATED "Pending", matching the recruiter\'s own billing table', () => {
    // Two surfaces naming one payment differently is worse than either word
    // being individually preferable. apps/recruiter's PaymentHistoryTable shows
    // the SAME row to the company whose payment it is.
    expect(PAYMENT_STATUS_LABEL.CREATED).toBe('Pending');
    expect(PAYMENT_STATUS_LABEL.PAID).toBe('Captured');
    expect(PAYMENT_STATUS_LABEL.FAILED).toBe('Failed');
  });

  it('labels every invoice status, including the three with no writer', () => {
    // PENDING, FAILED and REFUNDED are never produced today. Labelled anyway so
    // the day one acquires a writer this renders a word, not an enum member.
    expect(Object.keys(INVOICE_STATUS_LABEL).sort()).toEqual([
      'FAILED',
      'PAID',
      'PENDING',
      'REFUNDED',
    ]);
  });
});

describe('transactionsHref', () => {
  it('omits every default so the bare path is the canonical URL', () => {
    expect(transactionsHref('ALL', 1)).toBe('/transactions');
  });

  it('is basePath-relative', () => {
    // Next prefixes '/sadmin' itself; writing it here yields /sadmin/sadmin/...
    expect(transactionsHref('PAID', 1)).not.toContain('/sadmin');
  });

  it('CARRIES THE DATE RANGE THROUGH A TAB CHANGE', () => {
    // ⚠ The regression this builder exists to prevent. It does not preserve
    // unknown params by construction, so a `from`/`to` omitted from the
    // signature would be silently dropped by every tab click — and the next
    // number the admin reads would cover a different period than they think.
    expect(transactionsHref('FAILED', 1, '2026-08-01', '2026-08-31')).toBe(
      '/transactions?status=FAILED&from=2026-08-01&to=2026-08-31',
    );
  });

  it('carries the search and the page together with the range', () => {
    expect(transactionsHref('PAID', 3, '2026-08-01', '2026-08-31', 'acme')).toBe(
      '/transactions?status=PAID&from=2026-08-01&to=2026-08-31&q=acme&page=3',
    );
  });

  it('emits params in a fixed order so one view is one URL', () => {
    expect(transactionsHref('PAID', 2, '2026-08-01', undefined, 'x')).toBe(
      '/transactions?status=PAID&from=2026-08-01&q=x&page=2',
    );
  });

  it('encodes a query that would otherwise break the URL', () => {
    expect(transactionsHref('ALL', 1, undefined, undefined, 'a&b=c')).toBe(
      '/transactions?q=a%26b%3Dc',
    );
  });
});

describe('transactionDetailHref', () => {
  it('carries the full list state as typed params', () => {
    expect(transactionDetailHref(42, 'PAID', 2, '2026-08-01', '2026-08-31', 'acme')).toBe(
      '/transactions/42?status=PAID&from=2026-08-01&to=2026-08-31&q=acme&page=2',
    );
  });

  it('is a bare path when the list was unfiltered', () => {
    expect(transactionDetailHref(42, 'ALL', 1)).toBe('/transactions/42');
  });
});

describe('formatTransactionsSummary', () => {
  it('claims nothing has been recorded only when genuinely unfiltered', () => {
    expect(formatTransactionsSummary(0, 'ALL')).toBe(
      'No payment attempts have been recorded yet.',
    );
  });

  it('says nothing MATCHES when a filter is applied', () => {
    // ⚠ The distinction that matters on a financial screen: "we have taken no
    // money" and "nothing matches this filter" are different facts, and
    // conflating them tells an admin the platform is dead when they are looking
    // at a Tuesday.
    expect(formatTransactionsSummary(0, 'ALL', '2026-08-01', '2026-08-31')).toBe(
      'No payment attempts found between 2026-08-01 and 2026-08-31.',
    );
    expect(formatTransactionsSummary(0, 'FAILED')).toBe('No failed attempts found.');
    expect(formatTransactionsSummary(0, 'ALL', undefined, undefined, 'acme')).toBe(
      'No payment attempts found matching “acme”.',
    );
  });

  it('uses the singular for exactly one', () => {
    expect(formatTransactionsSummary(1, 'PAID')).toBe('1 captured payment.');
    expect(formatTransactionsSummary(2, 'PAID')).toBe('2 captured payments.');
  });

  it('groups the count in Indian digits', () => {
    expect(formatTransactionsSummary(1234567, 'ALL')).toBe('12,34,567 payment attempts.');
  });

  it('describes a one-sided range accurately', () => {
    expect(formatTransactionsSummary(5, 'ALL', '2026-08-01')).toBe(
      '5 payment attempts on or after 2026-08-01.',
    );
    expect(formatTransactionsSummary(5, 'ALL', undefined, '2026-08-31')).toBe(
      '5 payment attempts on or before 2026-08-31.',
    );
  });

  it('SAYS SO when a backwards range was ignored', () => {
    // Silently dropping a filter the admin can see in their own address bar is
    // how a figure covering the wrong period gets trusted.
    const summary = formatTransactionsSummary(9, 'ALL', undefined, undefined, undefined, true);
    expect(summary).toBe(
      '9 payment attempts. The date range was ignored because its end is before its start.',
    );
  });

  it('warns about the ignored range on the empty branch too', () => {
    expect(formatTransactionsSummary(0, 'ALL', undefined, undefined, undefined, true)).toContain(
      'The date range was ignored',
    );
  });
});

describe('taxableCaveat', () => {
  it('is silent when every captured payment has a taxable figure', () => {
    expect(taxableCaveat(10, 0)).toBeNull();
    expect(taxableCaveat(0, 0)).toBeNull();
  });

  it('names the gap a null-skipping SUM would otherwise hide', () => {
    // ⚠ Without this, the gross total is right, the taxable total quietly
    // understates, gross − taxable no longer equals the GST collected, and
    // nothing errors or looks wrong.
    expect(taxableCaveat(10, 3)).toBe(
      '3 of 10 captured payments have no taxable figure recorded, so the taxable total below excludes them.',
    );
  });

  it('agrees in number throughout the sentence for one row', () => {
    expect(taxableCaveat(10, 1)).toBe(
      '1 of 10 captured payment has no taxable figure recorded, so the taxable total below excludes it.',
    );
  });
});

describe('isMissingExpectedInvoice', () => {
  it('flags a captured payment with no invoice', () => {
    // The invoice is written in the SAME transaction as the activation, so this
    // means that transaction did not complete as designed.
    expect(isMissingExpectedInvoice({ status: 'PAID', invoice: null })).toBe(true);
  });

  it('does not flag a failed or pending attempt', () => {
    // An invoice is issued only at capture, so its absence here is expected.
    expect(isMissingExpectedInvoice({ status: 'FAILED', invoice: null })).toBe(false);
    expect(isMissingExpectedInvoice({ status: 'CREATED', invoice: null })).toBe(false);
  });

  it('does not flag a captured payment that has one', () => {
    expect(isMissingExpectedInvoice({ status: 'PAID', invoice: { id: 1 } })).toBe(false);
  });
});

describe('formatGstRate', () => {
  it('renders basis points as a percentage', () => {
    expect(formatGstRate(1800)).toBe('18%');
    expect(formatGstRate(500)).toBe('5%');
  });

  it('renders an unrecorded rate as a dash, never 0%', () => {
    // 0% is a claim that the sale was zero-rated. A dash says it is unknown.
    expect(formatGstRate(null)).toBe('—');
  });
});
