'use client';

import { useState } from 'react';
import type { TransactionTab } from '@jobportal/domain/txn-log-params';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Downloads the ledger as a CSV.
 *
 * ⚠ A fetch + blob, NOT a plain `<a href>` to the API. apps/sadmin and apps/api
 * are different origins, so a link would be a top-level navigation: on the 401
 * that a routinely-expiring 15-minute access token produces, the browser would
 * replace the console with raw JSON and eject the admin from the portal. A
 * fetch lets the failure be reported in place. Same shape as
 * apps/recruiter/components/billing/InvoiceDownloadButton.tsx, which cannot be
 * imported — no tsconfig path alias reaches across apps/.
 *
 * POST, because the endpoint writes an audit row. See the controller's comment:
 * a GET could be fired by a link prefetcher and forge an extraction the admin
 * never requested.
 */
export function ExportCsvButton({
  tab,
  from,
  to,
  q,
  exportKilled,
}: {
  tab: TransactionTab;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  exportKilled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The API requires both ends of the range: a period-less accounting file
  // cannot be reconciled. Saying so up front beats a 400 after a click.
  const missingRange = !from || !to;
  const disabled = exportKilled || missingRange || busy;

  const reason = exportKilled
    ? 'Export is temporarily switched off by an administrator.'
    : missingRange
      ? 'Choose both a start and an end date to export.'
      : null;

  async function download() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const res = await fetch(`${API_URL}/admin/transactions/export`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, tab, ...(q ? { q } : {}) }),
      });

      if (!res.ok) {
        // The three failures an admin can actually hit, each said plainly.
        if (res.status === 401) {
          setError('Your session has expired. Reload the page and sign in again.');
        } else if (res.status === 503) {
          setError('Export is temporarily switched off by an administrator.');
        } else if (res.status === 400) {
          const body: unknown = await res.json().catch(() => null);
          const message =
            Array.isArray(body) && typeof body[0]?.message === 'string'
              ? String(body[0].message)
              : typeof (body as { message?: unknown } | null)?.message === 'string'
                ? String((body as { message: string }).message)
                : 'The range could not be exported. Narrow it and try again.';
          setError(message);
        } else {
          setError(`The export failed (HTTP ${res.status}).`);
        }
        return;
      }

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      // The server names the file, including the gross-of-refunds caveat that
      // has to survive the download. Parsed from the header rather than rebuilt
      // here, so the two cannot drift.
      anchor.download =
        filenameFromDisposition(res.headers.get('Content-Disposition')) ??
        `jobportal-transactions-${from}_to_${to}-gross-of-refunds.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError(`Could not reach the API at ${API_URL}.`);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* aria-disabled, never the `disabled` attribute: `disabled` drops the
          control out of the tab order, so a keyboard user reaches the end of
          the toolbar without ever learning the button exists or why it will not
          work. Same treatment SubscriptionActions gives its killed buttons. */}
      <button
        type="button"
        onClick={download}
        aria-disabled={disabled}
        aria-describedby={reason ? 'transactions-export-reason' : undefined}
        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
          disabled
            ? 'cursor-not-allowed border-[var(--color-border)] text-[var(--color-fg-muted)]'
            : 'border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]'
        }`}
      >
        {busy ? 'Preparing…' : 'Export CSV'}
      </button>

      {reason && (
        <p id="transactions-export-reason" className="max-w-xs text-xs text-[var(--color-fg-muted)]">
          {reason}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="max-w-xs text-xs text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** `attachment; filename="x.csv"` → `x.csv`. Null when absent or unparseable. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}
