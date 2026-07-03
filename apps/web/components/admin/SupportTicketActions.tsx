'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@jobportal/ui';
import type { AdminTicketStatus } from './SupportTicketStatusPill';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const STATUS_OPTIONS: ReadonlyArray<{ value: AdminTicketStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

// Staff controls for a ticket: change status + reply. The trusted enforcement is
// the AdminGuard'd API (this is the UI for it). Status can be changed at any time
// (a reopen from CLOSED is a valid status change); the reply box is disabled on a
// CLOSED ticket with a hint to change the status first (the API 409s a reply to a
// closed ticket).
export function SupportTicketActions({
  ticketId,
  status,
}: {
  ticketId: number;
  status: AdminTicketStatus;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<AdminTicketStatus>(status);
  const [reply, setReply] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusId = useId();
  const replyId = useId();

  async function saveStatus() {
    if (nextStatus === status) return;
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
    } finally {
      setStatusBusy(false);
    }
  }

  async function sendReply() {
    if (reply.trim().length === 0) {
      setError('Enter a reply.');
      return;
    }
    setReplyBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }
      setReply('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reply');
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div className="space-y-6 rounded-md border border-[var(--color-border)] p-6">
      {/* Status control */}
      <div className="space-y-2">
        <label htmlFor={statusId} className="text-sm font-semibold text-[var(--color-fg)]">
          Status
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id={statusId}
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as AdminTicketStatus)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={saveStatus}
            loading={statusBusy}
            disabled={statusBusy || nextStatus === status}
          >
            Update status
          </Button>
        </div>
      </div>

      {/* Reply control */}
      <div className="space-y-2 border-t border-[var(--color-border)] pt-5">
        <label htmlFor={replyId} className="text-sm font-semibold text-[var(--color-fg)]">
          Reply to the recruiter
        </label>
        {status === 'CLOSED' ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            This ticket is closed — set a new status above to continue the conversation.
          </p>
        ) : (
          <>
            <Textarea
              id={replyId}
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply the recruiter will see on their ticket…"
            />
            <Button onClick={sendReply} loading={replyBusy} disabled={replyBusy}>
              Send reply
            </Button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
