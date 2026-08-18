import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRANSACTION_TAB,
  TRANSACTION_SELECT,
  TRANSACTION_TABS,
  escapeLikePattern,
  formatIstTimestamp,
  istDayEndExclusiveUtc,
  istDaySpan,
  istDayStartUtc,
  parseIstDay,
  parseTransactionTab,
  transactionWhere,
} from './txn-log-params';

describe('parseIstDay', () => {
  it('accepts a real calendar day', () => {
    expect(parseIstDay('2026-08-18')).toBe('2026-08-18');
  });

  it('rejects a day that does not exist rather than rolling it over', () => {
    // Date.parse rolls 2026-02-31 to 3 March. Accepting it would filter on a
    // range the admin never asked for.
    expect(parseIstDay('2026-02-31')).toBeUndefined();
    expect(parseIstDay('2026-13-01')).toBeUndefined();
    expect(parseIstDay('2026-00-10')).toBeUndefined();
  });

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(parseIstDay('2028-02-29')).toBe('2028-02-29');
    expect(parseIstDay('2026-02-29')).toBeUndefined();
  });

  it('degrades to undefined on garbage instead of throwing', () => {
    // These arrive from hand-edited and bookmarked URLs. A 500 on the ledger's
    // entry point would be far worse than an unfiltered render.
    expect(parseIstDay(undefined)).toBeUndefined();
    expect(parseIstDay('')).toBeUndefined();
    expect(parseIstDay('yesterday')).toBeUndefined();
    expect(parseIstDay('18-08-2026')).toBeUndefined();
    expect(parseIstDay('2026-8-18')).toBeUndefined();
  });

  it('takes the first value of a repeated param', () => {
    expect(parseIstDay(['2026-08-18', '2026-01-01'])).toBe('2026-08-18');
  });
});

describe('IST day boundaries', () => {
  it('starts an IST day at 18:30 UTC the previous day', () => {
    // 2026-08-18 00:00 IST === 2026-08-17 18:30 UTC. Getting this wrong drops
    // 00:00–05:30 IST of the first day out of every range.
    expect(istDayStartUtc('2026-08-18').toISOString()).toBe('2026-08-17T18:30:00.000Z');
  });

  it('ends a day at the start of the next IST day, exclusive', () => {
    expect(istDayEndExclusiveUtc('2026-08-18').toISOString()).toBe('2026-08-18T18:30:00.000Z');
  });

  it('leaves no gap between one day and the next', () => {
    // The whole point of an exclusive bound: a T23:59:59 upper bound drops the
    // final second, and a payment captured in it would appear in NO range.
    expect(istDayEndExclusiveUtc('2026-08-18').getTime()).toBe(
      istDayStartUtc('2026-08-19').getTime(),
    );
  });

  it('brackets the financial-year boundary correctly', () => {
    // The case that decides which FY a payment books into. A capture at
    // 2026-03-31 23:00 IST is 17:30 UTC on 31 March — inside FY 25-26 — and a
    // capture at 2026-04-01 02:00 IST is 20:30 UTC on 31 MARCH by the clock,
    // but belongs to FY 26-27. UTC-naive bucketing gets both wrong.
    const fyEnd = istDayEndExclusiveUtc('2026-03-31');
    const lateOn31March = new Date('2026-03-31T17:30:00.000Z'); // 23:00 IST, 31 Mar
    const earlyOn1April = new Date('2026-03-31T20:30:00.000Z'); // 02:00 IST, 1 Apr

    expect(lateOn31March.getTime()).toBeLessThan(fyEnd.getTime());
    expect(earlyOn1April.getTime()).toBeGreaterThanOrEqual(fyEnd.getTime());
    expect(istDayStartUtc('2026-04-01').getTime()).toBe(fyEnd.getTime());
  });

  it('counts an inclusive span, with a single day as 1', () => {
    expect(istDaySpan('2026-08-18', '2026-08-18')).toBe(1);
    expect(istDaySpan('2026-08-18', '2026-08-19')).toBe(2);
    expect(istDaySpan('2026-04-01', '2027-03-31')).toBe(365);
  });
});

describe('formatIstTimestamp', () => {
  it('renders the IST wall-clock time, not UTC', () => {
    // 2026-08-17T20:00Z is 01:30 IST on the 18th — the date itself differs.
    expect(formatIstTimestamp(new Date('2026-08-17T20:00:00.000Z'))).toBe('2026-08-18 01:30');
  });

  it('zero-pads so the column sorts lexicographically in a spreadsheet', () => {
    expect(formatIstTimestamp(new Date('2026-01-05T03:04:00.000Z'))).toBe('2026-01-05 08:34');
  });
});

describe('parseTransactionTab', () => {
  it('defaults to ALL so nobody reads a filtered subset as the total', () => {
    expect(DEFAULT_TRANSACTION_TAB).toBe('ALL');
    expect(parseTransactionTab(undefined)).toBe('ALL');
    expect(parseTransactionTab('nonsense')).toBe('ALL');
  });

  it('accepts every declared tab, case-insensitively', () => {
    for (const tab of TRANSACTION_TABS) {
      expect(parseTransactionTab(tab)).toBe(tab);
      expect(parseTransactionTab(tab.toLowerCase())).toBe(tab);
      expect(parseTransactionTab(` ${tab} `)).toBe(tab);
    }
  });

  it('does not resolve inherited Object.prototype keys', () => {
    // Validation is membership against the tuple, never `MAP[raw]`. Indexing a
    // plain object with these returns a truthy inherited value — the
    // prototype-chain class this repo has already shipped a HIGH for.
    expect(parseTransactionTab('__proto__')).toBe('ALL');
    expect(parseTransactionTab('toString')).toBe('ALL');
    expect(parseTransactionTab('constructor')).toBe('ALL');
  });
});

describe('escapeLikePattern', () => {
  it('neutralises the wildcards that would match every payment', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('100%_off')).toBe('100\\%\\_off');
  });

  it('escapes the backslash first so the other escapes survive', () => {
    // Escaping % before \ would turn '\%' into '\\%' and re-break it.
    expect(escapeLikePattern('\\')).toBe('\\\\');
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('Acme Corp')).toBe('Acme Corp');
  });
});

describe('transactionWhere', () => {
  it('omits the status key entirely on ALL', () => {
    expect(transactionWhere({ tab: 'ALL' })).toEqual({});
  });

  it('filters exactly on the two terminal states', () => {
    expect(transactionWhere({ tab: 'PAID' })).toEqual({ AND: [{ status: 'PAID' }] });
    expect(transactionWhere({ tab: 'FAILED' })).toEqual({ AND: [{ status: 'FAILED' }] });
  });

  it('expresses PENDING as the negation of the terminal states', () => {
    // Not `status: 'CREATED'`. A PaymentOrderStatus member added later must
    // surface in a tab rather than falling out of every one of them.
    expect(transactionWhere({ tab: 'PENDING' })).toEqual({
      AND: [{ NOT: { status: { in: ['PAID', 'FAILED'] } } }],
    });
  });

  it('brackets the date range on createdAt with an exclusive upper bound', () => {
    const where = transactionWhere({ tab: 'ALL', from: '2026-08-01', to: '2026-08-31' });
    expect(where).toEqual({
      AND: [
        {
          createdAt: {
            gte: new Date('2026-07-31T18:30:00.000Z'),
            lt: new Date('2026-08-31T18:30:00.000Z'),
          },
        },
      ],
    });
  });

  it('honours a one-sided range', () => {
    expect(transactionWhere({ tab: 'ALL', from: '2026-08-01' })).toEqual({
      AND: [{ createdAt: { gte: new Date('2026-07-31T18:30:00.000Z') } }],
    });
    expect(transactionWhere({ tab: 'ALL', to: '2026-08-31' })).toEqual({
      AND: [{ createdAt: { lt: new Date('2026-08-31T18:30:00.000Z') } }],
    });
  });

  it('searches company, invoice number and both gateway ids, all escaped', () => {
    const where = transactionWhere({ tab: 'ALL', q: '50%' });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { company: { name: { contains: '50\\%', mode: 'insensitive' } } },
            { invoice: { invoiceNumber: { contains: '50\\%', mode: 'insensitive' } } },
            { razorpayOrderId: { contains: '50\\%', mode: 'insensitive' } },
            { razorpayPaymentId: { contains: '50\\%', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('keeps status, range and search as separate AND members', () => {
    // The regression this AND-array shape exists to prevent: merged into one
    // object literal, the `q` OR would overwrite the PENDING NOT (or vice
    // versa) and a filter would silently vanish.
    const where = transactionWhere({
      tab: 'PAID',
      from: '2026-08-01',
      to: '2026-08-31',
      q: 'acme',
    });
    expect(where.AND).toHaveLength(3);
    expect(where).toEqual({
      AND: [
        { status: 'PAID' },
        {
          createdAt: {
            gte: new Date('2026-07-31T18:30:00.000Z'),
            lt: new Date('2026-08-31T18:30:00.000Z'),
          },
        },
        {
          OR: [
            { company: { name: { contains: 'acme', mode: 'insensitive' } } },
            { invoice: { invoiceNumber: { contains: 'acme', mode: 'insensitive' } } },
            { razorpayOrderId: { contains: 'acme', mode: 'insensitive' } },
            { razorpayPaymentId: { contains: 'acme', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('ignores a blank query rather than matching everything', () => {
    expect(transactionWhere({ tab: 'ALL', q: '' })).toEqual({});
  });
});

describe('TRANSACTION_SELECT', () => {
  it('selects the invoice as an optional relation — the LEFT JOIN', () => {
    // If this ever became a required `where: { invoice: { isNot: null } }`-style
    // filter, every FAILED and abandoned attempt would disappear from the
    // ledger, which is the exact failure the PaymentOrder spine exists to avoid.
    expect(TRANSACTION_SELECT.invoice.select.invoiceNumber).toBe(true);
    expect(TRANSACTION_SELECT.invoice.select.taxableInPaise).toBe(true);
  });

  it('carries gross and taxable as separate fields', () => {
    // Plan prices are GST-inclusive. A single money field would force the
    // consumer to pick one meaning, and picking gross overstates by 18%.
    expect(TRANSACTION_SELECT.amountInPaise).toBe(true);
    expect(TRANSACTION_SELECT.invoice.select.amountInPaise).toBe(true);
    expect(TRANSACTION_SELECT.invoice.select.taxableInPaise).toBe(true);
  });

  it('does not select the frozen buyer snapshot', () => {
    // buyerSnapshot holds the company's legal name, GSTIN and full address.
    // Nothing on this ledger renders it, and the CSV must not carry it — the
    // same PII discipline /sadmin/candidates applies by cutting fields from the
    // SELECT rather than hiding them in the markup.
    expect(TRANSACTION_SELECT.invoice.select).not.toHaveProperty('buyerSnapshot');
    expect(TRANSACTION_SELECT.invoice.select).not.toHaveProperty('pdfKey');
  });
});
