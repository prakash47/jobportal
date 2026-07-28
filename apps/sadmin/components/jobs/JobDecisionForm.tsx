'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Approve / send-back controls. Rendered only for a job actually awaiting a
// decision; the AdminGuard'd endpoint is the trusted enforcement point and
// re-checks the status itself, so this is UI for it, not a gate (CLAUDE.md §4).
//
// Mirrors apps/web's KycReviewActions — the repo's existing admin mutation
// pattern: client fetch with credentials:'include', then router.refresh().
// There are no server actions anywhere in this monorepo.
export function JobDecisionForm({ jobId }: { jobId: number }) {
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    // Client-side mirror of the DTO's refine. The API enforces it regardless;
    // checking here avoids a round-trip that can only fail.
    if (decision === 'REJECT' && reason.trim().length === 0) {
      setError('A reason is required when sending a job back.');
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/jobs/${jobId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'REJECT' ? { decision, reason: reason.trim() } : { decision },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        // 409 means another admin decided this job while the page was open —
        // worth saying plainly rather than showing a generic failure, because
        // the right response is "refresh and move on", not "try again".
        const message =
          res.status === 409
            ? 'Another admin has already reviewed this job. Refresh to see the outcome.'
            : typeof body?.message === 'string'
              ? body.message
              : `Request failed (${res.status})`;
        throw new Error(message);
      }
      // The decision changes what this page renders (status, banner, and whether
      // these controls appear at all), so re-render the server component rather
      // than navigating away.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : `Could not reach the API at ${API_URL}.`,
      );
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="sadmin-decision-heading"
      className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <div>
        <h2
          id="sadmin-decision-heading"
          className="text-sm font-semibold text-[var(--color-fg)]"
        >
          Decision
        </h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Approving publishes the job immediately and notifies the recruiter. Sending it back
          returns it to their drafts with your reason attached.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={reasonId} className="text-sm font-medium text-[var(--color-fg)]">
          Reason for sending back
        </label>
        <Textarea
          id={reasonId}
          value={reason}
          rows={3}
          maxLength={1000}
          placeholder="Required only when sending back — e.g. the salary range is missing, so candidates cannot tell what the role pays."
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-xs text-[var(--color-fg-muted)]">
          The recruiter sees this text exactly as written.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => decide('APPROVE')}
          loading={busy === 'APPROVE'}
          disabled={busy !== null}
        >
          Approve and publish
        </Button>
        <Button
          variant="secondary"
          onClick={() => decide('REJECT')}
          loading={busy === 'REJECT'}
          disabled={busy !== null}
        >
          Send back
        </Button>
      </div>
    </section>
  );
}
