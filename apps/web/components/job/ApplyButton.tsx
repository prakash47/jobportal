'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApplyButtonProps {
  jobId: number;
  jobSlug: string;        // canonicalSlug — used for /login?next=
  isAuthed: boolean;
  initialApplied: boolean;
  disabled?: boolean;     // closed/expired jobs
}

export function ApplyButton({
  jobId,
  jobSlug,
  isAuthed,
  initialApplied,
  disabled = false,
}: ApplyButtonProps) {
  const router = useRouter();
  const [applied, setApplied] = useState(initialApplied);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onClick() {
    if (!isAuthed) {
      // Open-redirect-safe: only allow same-origin internal paths.
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
        // Duplicate — server says we already applied. Mirror UI to that state.
        setApplied(true);
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
