'use client';

import { useState } from 'react';
import { Download, Loader2 } from '@jobportal/ui/icons';

// In-app invoice download. A plain <a href> to the cross-origin BFF would
// top-level-navigate the tab to raw JSON on any error (a 15-min access token
// expires during ordinary /billing dwell time → 401), ejecting the user from
// the portal. Instead we fetch the PDF as a blob with the auth cookie, trigger
// a client-side download, and surface errors in place (matching how the rest of
// the recruiter app degrades on an expired session).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function InvoiceDownloadButton({
  invoiceId,
  invoiceLabel,
}: {
  invoiceId: number;
  invoiceLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/recruiter/billing/invoices/${invoiceId}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Session expired — refresh the page and try again.'
            : 'Could not download the invoice.',
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={download}
        disabled={loading}
        aria-label={`Download invoice ${invoiceLabel}`}
        className="inline-flex size-8 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Download aria-hidden className="size-4" />
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </span>
      )}
    </div>
  );
}
