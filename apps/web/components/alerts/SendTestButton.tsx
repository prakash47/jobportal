'use client';

import { useState } from 'react';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Layer 3 of the killswitch enforcement (CLAUDE.md §4 + SRS §4.5.5). The
// parent server component does NOT render this button when the killswitch is
// ON; the API rejects manual triggers with 403 if someone POSTs directly.

export function SendTestButton({ id }: { id: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/me/alerts/${id}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Send test failed (${res.status})`);
      }
      setMsg('Queued — check your inbox in a moment.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Send test failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={onClick} loading={busy}>
        Send test email
      </Button>
      {msg && <p className="text-xs text-[var(--color-fg-muted)]">{msg}</p>}
    </div>
  );
}
