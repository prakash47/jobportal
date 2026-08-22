import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';
import { formatDateTimeIst } from '../../../../lib/jobs/format';
import { formatInrFromPaise } from '../../../../lib/subscriptions/format';
import {
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  clampPage,
  firstParam,
  formatGstRate,
  isMissingExpectedInvoice,
  normalizeQuery,
  parseIstDay,
  parseTransactionTab,
  transactionsHref,
} from '../../../../lib/transactions/format';
import { getTransaction } from '../../../../lib/transactions/queries';

export const metadata: Metadata = {
  title: 'Transaction — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  // Carried from the master list so Back returns to the exact filtered page the
  // admin left. Typed as Next actually delivers it — a repeated key arrives as
  // an array.
  searchParams: Promise<{
    status?: string | string[];
    from?: string | string[];
    to?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function TransactionDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. A layout is a
  // real boundary, but stating the requirement in the route makes it impossible
  // to move this file out from under that layout and silently lose the check —
  // the same call /candidates/[id], /job-postings/[id] and /subscriptions/[id]
  // make. This page shows a company's payment instrument ids and its GST place
  // of supply.
  await requireAdminScope('finance', 'READ_ONLY');

  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject junk before spending
  // a query on it.
  //
  // The digits-only test does real work beyond Number.isInteger: Number() also
  // accepts hex and exponent notation, so without it '0x1a' and '1e1' would
  // resolve to real rows under non-canonical URLs.
  //
  // The upper bound matters more. PaymentOrder.id is a Postgres int4, so an id
  // above 2147483647 does NOT come back as null — it throws out of Prisma
  // ("value is out of range for type integer"). With no segment error.tsx that
  // throw escapes to global-error and answers 500 where an unknown id deserves
  // 404. This repo has shipped that exact bug three times.
  //
  // ⚠ This notFound() also depends on there being NO loading.tsx in this segment
  // or its parents — a Suspense boundary flushes the shell first, the response
  // commits 200, and the 404 silently becomes a soft 404.
  const orderId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(orderId) || orderId < 1) notFound();
  if (orderId > 2_147_483_647) notFound();

  const sp = await searchParams;
  const tab = parseTransactionTab(sp.status);
  const from = parseIstDay(sp.from);
  const to = parseIstDay(sp.to);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));
  const backHref = transactionsHref(tab, page, from, to, q);

  const order = await getTransaction(orderId);
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          ← Back to Transaction &amp; Revenue Log
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {order.company.name}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {PAYMENT_STATUS_LABEL[order.status]} · {formatDateTimeIst(order.createdAt)} IST ·{' '}
            {formatInrFromPaise(order.amountInPaise)} gross
          </p>
        </header>
      </div>

      <Card title="Attempt">
        <Row label="Attempted (IST)">{formatDateTimeIst(order.createdAt)}</Row>
        <Row label="Captured (IST)">
          {order.paidAt === null ? '—' : formatDateTimeIst(order.paidAt)}
        </Row>
        <Row label="Status">{PAYMENT_STATUS_LABEL[order.status]}</Row>
        <Row label="Company">{order.company.name}</Row>
        <Row label="Plan">{order.plan.name}</Row>
        <Row label="Tier">{order.plan.tier}</Row>
        {/* Labelled with its GST treatment, like the list. This is what the card
            was charged, not what the sale was worth. */}
        <Row label="Gross charged (incl. GST)">{formatInrFromPaise(order.amountInPaise)}</Row>
        <Row label="Currency">{order.currency}</Row>
        <Row label="Razorpay order id">
          <span className="tabular-nums">{order.razorpayOrderId}</span>
        </Row>
        <Row label="Razorpay payment id">
          <span className="tabular-nums">{order.razorpayPaymentId ?? '—'}</span>
        </Row>
        {order.failureReason !== null && (
          <Row label="Failure reason">{order.failureReason}</Row>
        )}
      </Card>

      <Card title="Invoice & GST">
        {order.invoice === null ? (
          // ⚠ The empty state DIAGNOSES rather than reassures. An invoice is
          // written in the SAME transaction as the activation, so its absence
          // means two very different things depending on the order's status, and
          // collapsing them into one bland "No invoice" would hide a real fault.
          <p className="text-sm text-[var(--color-fg-muted)]">
            {isMissingExpectedInvoice(order)
              ? 'No invoice, which is unexpected for a captured payment — an invoice is issued in the same transaction as activation. Worth investigating.'
              : 'No invoice — one is issued only when a payment is captured.'}
          </p>
        ) : (
          <>
            <Row label="Invoice number">
              <span className="tabular-nums">{order.invoice.invoiceNumber ?? '—'}</span>
            </Row>
            <Row label="Invoice status">{INVOICE_STATUS_LABEL[order.invoice.status]}</Row>
            <Row label="Gross (incl. GST)">{formatInrFromPaise(order.invoice.amountInPaise)}</Row>
            {/* Em dash, never ₹0 — a zero would assert the taxable value was
                zero rather than unrecorded. */}
            <Row label="Taxable (ex-GST)">
              {order.invoice.taxableInPaise == null
                ? '—'
                : formatInrFromPaise(order.invoice.taxableInPaise)}
            </Row>
            <Row label="CGST">
              {order.invoice.cgstInPaise == null ? '—' : formatInrFromPaise(order.invoice.cgstInPaise)}
            </Row>
            <Row label="SGST">
              {order.invoice.sgstInPaise == null ? '—' : formatInrFromPaise(order.invoice.sgstInPaise)}
            </Row>
            <Row label="IGST">
              {order.invoice.igstInPaise == null ? '—' : formatInrFromPaise(order.invoice.igstInPaise)}
            </Row>
            <Row label="GST rate">{formatGstRate(order.invoice.gstRateBps)}</Row>
            <Row label="Place of supply">{order.invoice.placeOfSupply ?? '—'}</Row>
            <Row label="Plan sold as">{order.invoice.planNameSnapshot ?? '—'}</Row>
            <Row label="Period">
              {order.invoice.periodStart === null || order.invoice.periodEnd === null
                ? '—'
                : `${formatDateTimeIst(order.invoice.periodStart)} — ${formatDateTimeIst(order.invoice.periodEnd)}`}
            </Row>
          </>
        )}
      </Card>

      {/* The same caveat the export bakes into its filename. A refund issued
          from the Razorpay dashboard leaves this database unchanged, so nothing
          on this page can show it. */}
      <p className="text-xs text-[var(--color-fg-muted)]">
        Figures are gross of refunds. A refund issued from the payment gateway is not recorded in
        this database and does not appear here.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-fg)]">{children}</dd>
    </div>
  );
}
