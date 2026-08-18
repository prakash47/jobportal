import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    paymentOrder: { count: vi.fn(), findMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('@jobportal/feature-flags', () => ({
  FLAG: { KILL_ADMIN_TRANSACTION_EXPORT: 'killswitch.admin_transaction_export' },
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminTransactionsService } from './admin-transactions.service';

type Mock = ReturnType<typeof vi.fn>;
// A hand-written explicit shape, never `Record<string, ...>`: a widened record
// produces a wall of TS18048 under noUncheckedIndexedAccess at `pnpm typecheck`,
// which is a separate gate from `pnpm test`.
const m = prisma as unknown as {
  paymentOrder: { count: Mock; findMany: Mock };
  profileAuditLog: { create: Mock };
};
const flag = isFlagEnabled as unknown as Mock;

const ADMIN = 42;
const INPUT = { from: '2026-08-01', to: '2026-08-31' } as const;

const PAID_ROW = {
  id: 1,
  createdAt: new Date('2026-08-10T06:00:00.000Z'),
  paidAt: new Date('2026-08-10T06:05:00.000Z'),
  status: 'PAID',
  amountInPaise: 499900,
  currency: 'INR',
  razorpayOrderId: 'order_A',
  razorpayPaymentId: 'pay_A',
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
    planNameSnapshot: 'Growth Monthly',
    periodStart: new Date('2026-08-10T06:05:00.000Z'),
    periodEnd: new Date('2026-09-09T06:05:00.000Z'),
    paidAt: new Date('2026-08-10T06:05:00.000Z'),
  },
};

// A captured payment whose invoice never got a taxable figure. Structurally
// possible: taxableInPaise is nullable.
const PAID_NO_TAXABLE = {
  ...PAID_ROW,
  id: 2,
  invoice: { ...PAID_ROW.invoice, id: 12, taxableInPaise: null },
};

const FAILED_ROW = {
  ...PAID_ROW,
  id: 3,
  status: 'FAILED',
  paidAt: null,
  razorpayPaymentId: null,
  failureReason: 'Card declined',
  invoice: null,
};

describe('AdminTransactionsService', () => {
  let service: AdminTransactionsService;

  beforeEach(() => {
    vi.resetAllMocks();
    m.paymentOrder.count.mockResolvedValue(1);
    m.paymentOrder.findMany.mockResolvedValue([PAID_ROW]);
    m.profileAuditLog.create.mockResolvedValue({});
    flag.mockResolvedValue(false);
    service = new AdminTransactionsService();
  });

  // --- the killswitch (L3) -------------------------------------------------

  describe('killswitch.admin_transaction_export', () => {
    // ⚠ These mocks are keyed on the FLAG KEY, not a blanket true/false.
    //
    // A `flag.mockResolvedValue(true)` answers true for EVERY key, so the test
    // would pass identically with the emergency stop wired to the wrong flag or
    // to a typo'd string that exists nowhere. The key is written as a literal
    // here rather than imported from FLAG for the same reason: importing the
    // constant would make a rename of the underlying string invisible.
    const KILL = 'killswitch.admin_transaction_export';

    it('refuses the export when the killswitch is ON, before touching the database', () => {
      flag.mockImplementation(async (key: string) => key === KILL);
      return expect(service.export(ADMIN, INPUT))
        .rejects.toBeInstanceOf(ServiceUnavailableException)
        .then(() => {
          expect(m.paymentOrder.count).not.toHaveBeenCalled();
          expect(m.paymentOrder.findMany).not.toHaveBeenCalled();
          expect(m.profileAuditLog.create).not.toHaveBeenCalled();
        });
    });

    it('consults the transaction-export key specifically', async () => {
      flag.mockImplementation(async () => false);
      await service.export(ADMIN, INPUT);
      expect(flag.mock.calls.map((call) => call[0])).toContain(KILL);
    });

    it('is not blocked by a DIFFERENT killswitch being on', async () => {
      flag.mockImplementation(async (key: string) => key === 'killswitch.admin_subscription_write');
      await expect(service.export(ADMIN, INPUT)).resolves.toBeDefined();
    });

    it('permits the export when the killswitch is OFF (polarity)', async () => {
      // A killswitch throws on ENABLED. Copying a feature-toggle guard, which
      // throws on !enabled, would disable the export for everyone permanently.
      flag.mockImplementation(async () => false);
      await expect(service.export(ADMIN, INPUT)).resolves.toBeDefined();
    });
  });

  // --- the row cap ---------------------------------------------------------

  it('REFUSES an over-large export rather than truncating it', async () => {
    // A truncated CSV looks complete, sums to a smaller number, and gives its
    // recipient no signal at all that anything is missing.
    m.paymentOrder.count.mockResolvedValue(50_001);
    await expect(service.export(ADMIN, INPUT)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.paymentOrder.findMany).not.toHaveBeenCalled();
    expect(m.profileAuditLog.create).not.toHaveBeenCalled();
  });

  it('allows an export exactly at the cap', async () => {
    m.paymentOrder.count.mockResolvedValue(50_000);
    await expect(service.export(ADMIN, INPUT)).resolves.toBeDefined();
  });

  // --- the query -----------------------------------------------------------

  it('passes the same where-clause to the count and the fetch', async () => {
    await service.export(ADMIN, { ...INPUT, tab: 'PAID', q: 'acme' });
    const countWhere = m.paymentOrder.count.mock.calls[0]?.[0]?.where;
    const findWhere = m.paymentOrder.findMany.mock.calls[0]?.[0]?.where;
    // If the pre-count and the fetch could disagree, the cap would be measured
    // against a different set than the one written to the file.
    expect(countWhere).toEqual(findWhere);
  });

  it('brackets the range on createdAt with IST boundaries', async () => {
    await service.export(ADMIN, INPUT);
    const where = m.paymentOrder.findMany.mock.calls[0]?.[0]?.where;
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

  it('sorts with an id tiebreak so two exports of one range agree', async () => {
    await service.export(ADMIN, INPUT);
    expect(m.paymentOrder.findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  // --- the audit row -------------------------------------------------------

  describe('the audit row', () => {
    it('is written against the acting admin with the range and totals', async () => {
      m.paymentOrder.count.mockResolvedValue(3);
      m.paymentOrder.findMany.mockResolvedValue([PAID_ROW, PAID_NO_TAXABLE, FAILED_ROW]);
      await service.export(ADMIN, { ...INPUT, tab: 'ALL' });

      const data = m.profileAuditLog.create.mock.calls[0]?.[0]?.data;
      expect(data.userId).toBe(ADMIN);
      expect(data.action).toBe('BILLING_TRANSACTIONS_EXPORTED');
      expect(data.diff).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
        tab: 'ALL',
        hadQuery: false,
        rowCount: 3,
        // Only the two PAID rows contribute. Counting the FAILED attempt would
        // book a declined card as revenue.
        grossInPaise: 499900 * 2,
        // The null-taxable row contributes nothing to the taxable total...
        taxableInPaise: 423644,
        // ...and is counted separately, so the gap is visible rather than
        // silently swallowed by a null-skipping SUM.
        nullTaxableRows: 1,
      });
    });

    it('records WHETHER a query narrowed the file, never the query text', async () => {
      // The search terms would name the company being investigated. This row
      // exists to police the export, not to become a second copy of it.
      await service.export(ADMIN, { ...INPUT, q: 'acme consulting' });
      const diff = m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff;
      expect(diff.hadQuery).toBe(true);
      expect(Object.keys(diff).sort()).toEqual([
        'from',
        'grossInPaise',
        'hadQuery',
        'nullTaxableRows',
        'rowCount',
        'tab',
        'taxableInPaise',
        'to',
      ]);
    });

    it('carries no company name, invoice number or buyer detail', async () => {
      // Asserted positively on the exact key set above AND negatively on the
      // serialised form here, because a nested object would slip past a
      // top-level key check.
      await service.export(ADMIN, INPUT);
      const diff = m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff;
      const serialised = JSON.stringify(diff);
      expect(serialised).not.toContain('Acme');
      expect(serialised).not.toContain('INV-2627');
      expect(serialised).not.toContain('Maharashtra');
      expect(serialised).not.toContain('order_A');
    });

    it('records an empty export honestly rather than skipping the row', async () => {
      m.paymentOrder.count.mockResolvedValue(0);
      m.paymentOrder.findMany.mockResolvedValue([]);
      await service.export(ADMIN, INPUT);
      const diff = m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff;
      expect(diff.rowCount).toBe(0);
      expect(diff.grossInPaise).toBe(0);
      expect(m.profileAuditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  // --- the returned file ---------------------------------------------------

  it('names the window and the refund caveat in the filename', async () => {
    const { filename } = await service.export(ADMIN, INPUT);
    expect(filename).toBe('jobportal-transactions-2026-08-01_to_2026-08-31-gross-of-refunds.csv');
  });

  it('returns a UTF-8 buffer whose null taxable is an empty cell', async () => {
    m.paymentOrder.findMany.mockResolvedValue([PAID_NO_TAXABLE]);
    const { csv } = await service.export(ADMIN, INPUT);
    const text = csv.toString('utf8');
    expect(text).toContain('"4999.00"'); // gross, from the order
    expect(text).not.toContain('"0.00"'); // taxable must NOT read as zero
  });

  it('defaults to the ALL tab when none is given', async () => {
    await service.export(ADMIN, INPUT);
    expect(m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff?.tab).toBe('ALL');
  });
});
