'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { EVENTS, track } from '../../lib/analytics/posthog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function WithdrawButton({
  applicationId,
  jobTitle,
}: {
  applicationId: number;
  jobTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(`Withdraw your application for "${jobTitle}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/me/applications/${applicationId}/withdraw`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Withdraw failed (${res.status})`);
      }
      // Phase 1 item 18 — fire only after API confirms. Withdraw is a
      // strong negative signal worth funneling for product feedback.
      track(EVENTS.APPLICATION_WITHDRAWN, { applicationId });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdraw failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={onClick} loading={busy || pending}>
        Withdraw
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
