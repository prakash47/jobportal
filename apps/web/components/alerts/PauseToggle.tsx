'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function PauseToggle({ id, isActive }: { id: number; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/me/alerts/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} loading={busy || pending}>
      {isActive ? 'Pause' : 'Resume'}
    </Button>
  );
}
