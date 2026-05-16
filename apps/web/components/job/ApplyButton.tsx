'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import { EVENTS, track } from '../../lib/analytics/posthog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApplyQuotaState {
  count: number;
  limit: number;
  unlimited: boolean;
  upgradeAvailable: boolean;
}

export interface ApplyButtonProps {
  jobId: number;
  jobSlug: string;        // canonicalSlug — used for /login?next=
  isAuthed: boolean;
  initialApplied: boolean;
  disabled?: boolean;     // closed/expired jobs
  // SRS §4.11.16-17 — Layer 2 hint. When provided, the button can render
  // an at-limit disabled state without waiting for the API 429.
  quota?: ApplyQuotaState | null | undefined;
}

interface QuotaError {
  message?: string;
  count?: number;
  limit?: number;
  upgradeAvailable?: boolean;
}

export function ApplyButton({
  jobId,
  jobSlug,
  isAuthed,
  initialApplied,
  disabled = false,
  quota,
}: ApplyButtonProps) {
  const router = useRouter();
  const [applied, setApplied] = useState(initialApplied);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(
    quota && !quota.unlimited && quota.count >= quota.limit,
  );
  const [upgradeAvailable, setUpgradeAvailable] = useState(quota?.upgradeAvailable ?? false);

  if (disabled) {
    return (
      <Button variant="primary" disabled>
        Applications closed
      </Button>
    );
  }

  if (applied) {
    return (
      <Button variant="secondary" disabled leadingIcon={<Check className="size-4" />}>
        Applied
      </Button>
    );
  }

  if (exhausted) {
    return (
      <div className="space-y-1.5">
        <Button variant="primary" disabled>
          Daily limit reached
        </Button>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {upgradeAvailable ? (
            <>
              Upgrade your plan to apply to more jobs today.{' '}
              <Link href="/pricing" className="font-medium text-[var(--color-primary-600)] hover:underline">
                See plans →
              </Link>
            </>
          ) : (
            'You can apply again tomorrow.'
          )}
        </p>
      </div>
    );
  }

  async function onClick() {
    // Phase 1 item 18 — fire the event up-front so we capture intent
    // even when the API rejects (anon redirect, 429, network error).
    // outcome is filled in below for the successful path.
    track(EVENTS.JOB_APPLY_CLICKED, { jobId });

    if (!isAuthed) {
      const next = `/job/${jobSlug}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/me/applications`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      if (res.status === 201) {
        setApplied(true);
        return;
      }
      if (res.status === 409) {
        setApplied(true);
        return;
      }
      if (res.status === 429) {
        // SRS §4.11.16-17 — quota exhausted. Mirror the at-limit UI so the
        // user gets the calm 'tomorrow' message (or upgrade CTA when the
        // subscription system is enabled).
        const body = (await res.json().catch(() => ({}))) as QuotaError;
        setUpgradeAvailable(body.upgradeAvailable ?? false);
        setExhausted(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Apply failed (${res.status})`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button onClick={onClick} loading={busy} variant="primary">
        Apply now
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
