import type { Prisma } from '@jobportal/db';

// Consecutive invoice numbers per Indian financial year (Apr–Mar), CGST Rule
// 46: "a consecutive serial number not exceeding sixteen characters". Format:
// INV-2627-000001 (14 chars). Allocation is race-free via a transaction-scoped
// Postgres advisory lock — two concurrent activations serialize on the lock,
// read the current max, and each get a distinct next number. The lock releases
// automatically at commit/rollback (pg_advisory_xact_lock).

export const INVOICE_PREFIX = 'INV';

// IST-shifted calendar fields. Indian FY membership and the printed invoice
// date are defined in IST for GST; production hosts (Render) default to UTC, so
// a naive getMonth()/getFullYear() would misfile every capture between 00:00
// and 05:30 IST — and roll a 1-April-early-morning payment into the prior FY's
// serial sequence. Shift by +05:30 and read the UTC fields of the shifted date.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(date: Date): { year: number; month: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() }; // month 0-based
}

// Indian FY: April 2026 – March 2027 → "2627" (computed in IST).
export function fyCode(date: Date): string {
  const { year, month } = istParts(date);
  const startYear = month >= 3 ? year : year - 1; // April = 3
  return `${String(startYear % 100).padStart(2, '0')}${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function formatInvoiceNumber(fy: string, seq: number): string {
  return `${INVOICE_PREFIX}-${fy}-${String(seq).padStart(6, '0')}`;
}

type Tx = Prisma.TransactionClient;

export async function allocateInvoiceNumber(tx: Tx, now: Date): Promise<string> {
  // Serialize allocators. hashtext() maps the label to the bigint key space;
  // the lock is held until this transaction ends.
  //
  // ⚠ $executeRaw, NOT $queryRaw. pg_advisory_xact_lock() returns `void` and
  // Prisma cannot deserialize a void column — through $queryRaw it throws
  // "Failed to deserialize column of type 'void'" (P2010 /
  // UnsupportedNativeDataType). This is the SECOND instance of that defect on
  // the capture path: activatePaidOrder held the other, and neither had ever
  // executed because PaymentOrder has zero rows and every test mocks Prisma, so
  // the first real payment would have failed here after the card was charged.
  // See the fuller note at RecruiterBillingService.activatePaidOrder; both are
  // pinned by packages/db/src/advisory-lock.test.ts against real Postgres.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('billing:invoice-number'))`;

  const fy = fyCode(now);
  const prefix = `${INVOICE_PREFIX}-${fy}-`;
  // Zero-padded fixed width ⇒ lexicographic max == numeric max.
  const last = await tx.subscriptionInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastSeq = last?.invoiceNumber ? Number.parseInt(last.invoiceNumber.slice(prefix.length), 10) : 0;
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return formatInvoiceNumber(fy, nextSeq);
}
