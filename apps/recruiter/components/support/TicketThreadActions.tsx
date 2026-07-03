'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@jobportal/ui';
import type { SupportTicketStatus } from '@jobportal/db';
import { api } from '../../lib/api-client';

// Reply + close controls for a ticket thread. When the ticket is CLOSED there is
// no form — just a note to raise a new ticket. Otherwise the recruiter can reply
// (a reply to a RESOLVED ticket reopens it — flagged in the helper text) and
// close the ticket via a two-click confirm.
export function TicketThreadActions({
  ticketId,
  status,
}: {
  ticketId: number;
  status: SupportTicketStatus;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const replyId = useId();

  if (status === 'CLOSED') {
    return (
      <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4 text-sm text-[var(--color-fg-muted)]">
        This ticket is closed. Raise a new ticket if you need more help.
      </p>
    );
  }

  async function onReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (body.trim().length < 1) {
      setError('Enter a reply.');
      return;
    }

    setReplying(true);
    const res = await api(`/recruiter/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: body.trim() }),
    });
    setReplying(false);

    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not send your reply.');
      return;
    }
    setBody('');
    router.refresh();
  }

  async function onClose() {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    setError(null);
    setClosing(true);
    const res = await api(`/recruiter/support/tickets/${ticketId}/close`, { method: 'POST' });
    setClosing(false);

    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not close the ticket.');
      setConfirmClose(false);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-4 border-t border-[var(--color-border)] pt-6">
      <form onSubmit={onReply} className="space-y-3" noValidate>
        <label htmlFor={replyId} className="block text-sm font-medium text-[var(--color-fg)]">
          Add a reply
        </label>
        <Textarea
          id={replyId}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add more detail or respond to support…"
        />
        {status === 'RESOLVED' && (
          <p className="text-xs text-[var(--color-fg-muted)]">
            This ticket is marked resolved — replying will reopen it.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={replying}>
            Send reply
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={closing}
            onClick={onClose}
            onBlur={() => setConfirmClose(false)}
          >
            {confirmClose ? 'Click again to confirm' : 'Close ticket'}
          </Button>
        </div>
      </form>
    </section>
  );
}
