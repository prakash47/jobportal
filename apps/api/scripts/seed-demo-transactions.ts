// Dev helper: put a handful of PaymentOrder + SubscriptionInvoice rows in the
// LOCAL database so /sadmin/transactions and its CSV export can actually be
// looked at.
//
// ⚠ WHY THIS EXISTS. Every table the Transaction & Revenue Log reads is empty
// and structurally CANNOT fill: `subscription.system.enabled` is off, all three
// per-tier plan flags are off, Razorpay runs in keyless stub mode, and the one
// path that can create a Subscription (an admin comp) deliberately issues no
// invoice and no order. So the feature would otherwise ship having never
// rendered a single row.
//
// That is not a theoretical worry on this module. `activatePaidOrder` and
// `allocateInvoiceNumber` both issued `pg_advisory_xact_lock()` through
// `$queryRaw` — which Prisma cannot deserialize — for six weeks. Every test
// mocked Prisma, PaymentOrder had zero rows, and the bug would have surfaced
// for the first time by throwing AFTER a real customer was charged. Mocked
// tests cannot catch that class; rows you can look at can.
//
// The four rows below are chosen to cover the states the ledger renders
// differently, including the two that are easy to get wrong:
//   1. captured + full GST breakup   — the happy path
//   2. captured + NULL taxable       — must render an em dash, never ₹0
//   3. failed with a reason          — no invoice at all
//   4. abandoned (CREATED)           — no invoice, "Pending", not a receivable
//
// Local dev only. Refuses to run against a non-local DATABASE_URL.
//
//   tsx apps/api/scripts/seed-demo-transactions.ts          # insert
//   tsx apps/api/scripts/seed-demo-transactions.ts --clean  # remove them again
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

const LOCAL_DB = /localhost|127\.0\.0\.1|::1|\.local|\.internal/;

// Marks every row this script creates, so --clean can remove exactly them and
// nothing else. A real Razorpay id never carries this prefix.
const DEMO_PREFIX = 'order_demo_txn_';

async function main(): Promise<void> {
  const clean = process.argv.includes('--clean');

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!LOCAL_DB.test(dbUrl)) {
    console.error(
      'Refusing to run: DATABASE_URL does not look local. This script writes fake payment rows.',
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import('@jobportal/db');

  if (clean) {
    // Invoices are removed first: SubscriptionInvoice.paymentOrderId is
    // onDelete: SetNull, so deleting the orders alone would leave orphaned
    // invoices behind — which is exactly the state countOrphanInvoices warns
    // about, and it would look like a real finding rather than this script's
    // litter.
    const orders = await prisma.paymentOrder.findMany({
      where: { razorpayOrderId: { startsWith: DEMO_PREFIX } },
      select: { id: true },
    });
    const ids = orders.map((order) => order.id);
    const invoices = await prisma.subscriptionInvoice.deleteMany({
      where: { paymentOrderId: { in: ids } },
    });
    const deleted = await prisma.paymentOrder.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${deleted.count} demo order(s) and ${invoices.count} demo invoice(s).`);
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.paymentOrder.count({
    where: { razorpayOrderId: { startsWith: DEMO_PREFIX } },
  });
  if (existing > 0) {
    console.log(`${existing} demo order(s) already present. Run with --clean first to reset.`);
    await prisma.$disconnect();
    return;
  }

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { audience: 'RECRUITER' },
    orderBy: { priceInPaise: 'desc' },
  });
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  const recruiter = await prisma.recruiter.findFirst({
    where: company ? { companyId: company.id } : {},
    select: { userId: true },
  });

  if (!plan || !company || !recruiter) {
    console.error(
      'Need at least one RECRUITER plan, one company and one recruiter. Run `pnpm db:seed` and `pnpm --filter @jobportal/db db:seed:demo:full` first.',
    );
    await prisma.$disconnect();
    return;
  }

  // Fixed instants rather than offsets from "now", so two runs produce the same
  // rows and a screenshot stays reproducible. Spread across a few IST days so
  // the date filter has something to bite on.
  const day = (iso: string): Date => new Date(iso);

  // 1. Captured, with the full GST breakup an intra-state sale produces.
  //    4999.00 gross at 18% inclusive → 4236.44 taxable + 381.28 + 381.28.
  const paid = await prisma.paymentOrder.create({
    data: {
      companyId: company.id,
      createdByUserId: recruiter.userId,
      planId: plan.id,
      amountInPaise: 499900,
      status: 'PAID',
      razorpayOrderId: `${DEMO_PREFIX}paid`,
      razorpayPaymentId: 'pay_demo_txn_paid',
      paidAt: day('2026-08-10T06:05:00.000Z'),
      createdAt: day('2026-08-10T06:00:00.000Z'),
    },
  });
  const subscription = await prisma.subscription.findFirst({ orderBy: { id: 'asc' } });
  if (subscription) {
    await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        companyId: company.id,
        paymentOrderId: paid.id,
        invoiceNumber: 'INV-2627-DEMO01',
        amountInPaise: 499900,
        taxableInPaise: 423644,
        cgstInPaise: 38128,
        sgstInPaise: 38128,
        gstRateBps: 1800,
        placeOfSupply: 'Maharashtra',
        planNameSnapshot: plan.name,
        periodStart: day('2026-08-10T06:05:00.000Z'),
        periodEnd: day('2026-09-09T06:05:00.000Z'),
        status: 'PAID',
        paidAt: day('2026-08-10T06:05:00.000Z'),
      },
    });

    // 2. Captured, but the invoice carries NO taxable figure. Structurally
    //    possible (the column is nullable) and the case the whole
    //    empty-cell-never-zero rule exists for — both on screen and in the CSV.
    const paidNoTax = await prisma.paymentOrder.create({
      data: {
        companyId: company.id,
        createdByUserId: recruiter.userId,
        planId: plan.id,
        amountInPaise: 499900,
        status: 'PAID',
        razorpayOrderId: `${DEMO_PREFIX}paid_no_taxable`,
        razorpayPaymentId: 'pay_demo_txn_notax',
        paidAt: day('2026-08-12T09:31:00.000Z'),
        createdAt: day('2026-08-12T09:30:00.000Z'),
      },
    });
    await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        companyId: company.id,
        paymentOrderId: paidNoTax.id,
        invoiceNumber: 'INV-2627-DEMO02',
        amountInPaise: 499900,
        planNameSnapshot: plan.name,
        status: 'PAID',
        paidAt: day('2026-08-12T09:31:00.000Z'),
      },
    });
  } else {
    console.warn('No Subscription row found — created the orders without invoices.');
  }

  // 3. Failed, with a reason. No invoice: one is issued only at capture.
  await prisma.paymentOrder.create({
    data: {
      companyId: company.id,
      createdByUserId: recruiter.userId,
      planId: plan.id,
      amountInPaise: 499900,
      status: 'FAILED',
      razorpayOrderId: `${DEMO_PREFIX}failed`,
      failureReason: 'Card declined by issuing bank',
      createdAt: day('2026-08-14T11:00:00.000Z'),
    },
  });

  // 4. Abandoned checkout. Nothing sweeps these, so it stays CREATED forever
  //    and renders as "Pending" — which is NOT money owed.
  await prisma.paymentOrder.create({
    data: {
      companyId: company.id,
      createdByUserId: recruiter.userId,
      planId: plan.id,
      amountInPaise: 499900,
      status: 'CREATED',
      razorpayOrderId: `${DEMO_PREFIX}abandoned`,
      createdAt: day('2026-08-15T04:20:00.000Z'),
    },
  });

  const total = await prisma.paymentOrder.count({
    where: { razorpayOrderId: { startsWith: DEMO_PREFIX } },
  });
  console.log(
    `Inserted ${total} demo payment order(s) for "${company.name}" on plan "${plan.name}".`,
  );
  console.log('View them at /sadmin/transactions (try a range of 2026-08-01 to 2026-08-31).');
  console.log('Remove them again with: tsx apps/api/scripts/seed-demo-transactions.ts --clean');

  await prisma.$disconnect();
}

void main();
