import { Badge, type BadgeVariant } from '@jobportal/ui';
import { InvoiceDownloadButton } from './InvoiceDownloadButton';

// Payment / transaction history for /billing. Server-renderable; the download
// is a client island (InvoiceDownloadButton) that fetches the PDF as a blob so
// an expired session degrades in-place instead of navigating the tab to raw
// JSON. Guards + the owner/admin check run on every download at the API.

export interface PaymentHistoryRow {
  id: number;
  createdAt: string; // ISO
  planName: string;
  amountInPaise: number;
  status: 'CREATED' | 'PAID' | 'FAILED';
  failureReason: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
}

const STATUS: Record<PaymentHistoryRow['status'], { variant: BadgeVariant; label: string }> = {
  CREATED: { variant: 'neutral', label: 'Pending' },
  PAID: { variant: 'success', label: 'Paid' },
  FAILED: { variant: 'danger', label: 'Failed' },
};

const TH =
  'border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtAmount = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentHistoryTable({
  rows,
  canDownload,
}: {
  rows: PaymentHistoryRow[];
  canDownload: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-fg-muted)]">
        No payments yet. Your transactions and invoices will appear here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className={TH}>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Plan</th>
            <th className="px-4 py-2.5">Amount</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5 text-right">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = STATUS[row.status];
            return (
              <tr key={row.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">{fmtDate(row.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{row.planName}</td>
                <td className="px-4 py-3 text-[var(--color-fg)]">{fmtAmount(row.amountInPaise)}</td>
                <td className="px-4 py-3">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {row.status === 'FAILED' && row.failureReason && (
                    // Visible (not a hover-only title) so keyboard/touch/screen-
                    // reader users can read WHY a payment failed.
                    <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                      {row.failureReason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.invoiceId !== null && canDownload ? (
                    <InvoiceDownloadButton
                      invoiceId={row.invoiceId}
                      invoiceLabel={row.invoiceNumber ?? `invoice-${row.invoiceId}`}
                    />
                  ) : (
                    <span className="text-xs text-[var(--color-fg-subtle)]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
