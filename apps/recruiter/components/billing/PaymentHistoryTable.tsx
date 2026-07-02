import { Badge, type BadgeVariant } from '@jobportal/ui';
import { Download } from '@jobportal/ui/icons';

// Payment / transaction history for /billing. Server-renderable — the invoice
// download is a plain link to the BFF's streaming endpoint (the auth cookie
// rides along; guards + the owner/admin check run on every download).

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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
                  <Badge
                    variant={status.variant}
                    title={row.status === 'FAILED' ? (row.failureReason ?? undefined) : undefined}
                  >
                    {status.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {row.invoiceId !== null && canDownload ? (
                    // Anchor styled like the ghost IconButton (which renders a
                    // <button> only) — a real link so the PDF streams with the
                    // browser's normal download UX.
                    <a
                      href={`${API_URL}/recruiter/billing/invoices/${row.invoiceId}/download`}
                      aria-label={`Download invoice ${row.invoiceNumber ?? row.invoiceId}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                    >
                      <Download aria-hidden className="size-4" />
                    </a>
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
