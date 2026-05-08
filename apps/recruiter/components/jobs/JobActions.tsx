'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function CloseJobButton({ id, title }: { id: number; title: string }) {
  return <ActionButton id={id} title={title} action="close" label="Close" />;
}

export function ReopenJobButton({ id, title }: { id: number; title: string }) {
  return <ActionButton id={id} title={title} action="reopen" label="Reopen" />;
}

function ActionButton({
  id,
  title,
  action,
  label,
}: {
  id: number;
  title: string;
  action: 'close' | 'reopen';
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (action === 'close' && !confirm(`Close "${title}"? Candidates will no longer see it.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/recruiter/jobs/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`${label} failed (${res.status})`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} loading={busy || pending}>
      {label}
    </Button>
  );
}
