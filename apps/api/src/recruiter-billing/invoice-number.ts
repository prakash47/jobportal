import type { Prisma } from '@jobportal/db';

// Consecutive invoice numbers per Indian financial year (Apr–Mar), CGST Rule
// 46: "a consecutive serial number not exceeding sixteen characters". Format:
// INV-2627-000001 (14 chars). Allocation is race-free via a transaction-scoped
// Postgres advisory lock — two concurrent activations serialize on the lock,
// read the current max, and each get a distinct next number. The lock releases
// automatically at commit/rollback (pg_advisory_xact_lock).

export const INVOICE_PREFIX = 'INV';

// Indian FY: April 2026 – March 2027 → "2627".
export function fyCode(date: Date): string {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // months are 0-based; April = 3
  return `${String(startYear % 100).padStart(2, '0')}${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function formatInvoiceNumber(fy: string, seq: number): string {
  return `${INVOICE_PREFIX}-${fy}-${String(seq).padStart(6, '0')}`;
}

type Tx = Prisma.TransactionClient;

export async function allocateInvoiceNumber(tx: Tx, now: Date): Promise<string> {
  // Serialize allocators. hashtext() maps the label to the bigint key space;
  // the lock is held until this transaction ends.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('billing:invoice-number'))`;

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
