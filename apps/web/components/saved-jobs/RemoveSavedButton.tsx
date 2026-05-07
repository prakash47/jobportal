'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function RemoveSavedButton({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/me/saved-jobs/${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 404) {
        // 404 = already removed, treat as success.
        throw new Error(`Remove failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} loading={busy || pending}>
      Remove
    </Button>
  );
}
