'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Approve / reject controls for a PENDING submission. Rendered only when the
// submission is pending review; the trusted enforcement is the AdminGuard'd
// API endpoint (this is the UI for it).
export function KycReviewActions({ companyId }: { companyId: number }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    if (decision === 'REJECT' && reason.trim().length === 0) {
      setError('A reason is required when rejecting.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/kyc/${companyId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'REJECT' ? { decision, reason: reason.trim() } : { decision }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit decision');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-[var(--color-border)] p-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Decision</h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Approve to grant the verified badge, or reject with a reason the recruiter will see.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="kyc-reject-reason" className="text-sm font-medium text-[var(--color-fg)]">
          Rejection reason
        </label>
        <Textarea
          id="kyc-reject-reason"
          value={reason}
          rows={3}
          maxLength={1000}
          placeholder="Required only when rejecting — e.g. GST number does not match the registration document."
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => decide('APPROVE')} loading={busy} disabled={busy}>
          Approve verification
        </Button>
        <Button variant="secondary" onClick={() => decide('REJECT')} disabled={busy}>
          Reject
        </Button>
      </div>
    </div>
  );
}
