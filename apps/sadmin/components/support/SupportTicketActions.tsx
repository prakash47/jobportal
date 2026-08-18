'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SupportTicketStatus } from '@jobportal/db';
import { Button, Textarea } from '@jobportal/ui';
import { SUPPORT_STATUS_LABEL, canReply } from '../../lib/support/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The maximum the API's StaffReplyDto accepts. Mirrored so the box cannot overrun it. */
const REPLY_MAX = 5000;

const STATUS_OPTIONS: readonly SupportTicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

/**
 * Staff controls for a ticket: change status, and reply to the recruiter.
 *
 * ⚠ EVERYTHING IN THIS COMPONENT IS SEEN BY THE RECRUITER. The reply lands in
 * SupportTicketMessage and rings their bell. Staff-only text belongs in
 * InternalNoteForm, which is rendered as a visually separate panel with its own
 * heading for exactly that reason — the one way this feature can go wrong is a
 * candid internal assessment typed into the box below.
 *
 * Writes go through apps/api — never a server action or a Prisma call in the RSC
 * — so AdminGuard, the audit row and the bell notification all apply.
 * lib/support/queries.ts states the same rule from the read side.
 *
 * ⚠ The access_token cookie is HttpOnly and set on the sadmin origin, while the
 * API is a different origin — so these fetches MUST send credentials explicitly.
 * `credentials: 'include'` is what carries it; without it the call arrives
 * unauthenticated and AdminGuard 401s.
 *
 * Status can be changed at any time (a reopen from CLOSED is a valid status
 * change); the reply box is replaced by a hint on a CLOSED ticket, because the
 * API 409s a reply to one.
 */
export function SupportTicketActions({
  ticketId,
  status,
}: {
  ticketId: number;
  status: SupportTicketStatus;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<SupportTicketStatus>(status);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Bumped on every setError so the alert node REMOUNTS. Without it, a second
  // failure with an identical message hits React's Object.is bailout, the
  // <p role="alert"> neither remounts nor changes text, and a screen-reader user
  // gets silence on their second attempt. Same fix as ReportDecisionForm.
  const [errorNonce, setErrorNonce] = useState(0);
  const [loading, setLoading] = useState<'status' | 'reply' | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusId = useId();
  const replyId = useId();

  // ONE in-flight flag covering the request AND the router.refresh() that
  // follows it. Gating every control is what makes the shared `error` state
  // safe: a second action cannot start while one is resolving, so a landing
  // response can never attribute a reply failure to a status change.
  const busy = loading !== null || isPending;

  // The status select is a LOCAL mirror re-synced only on a genuine external
  // change, not a value read straight off the server prop. A control bound
  // directly to a prop that arrives via router.refresh() writes the stale value
  // back after the change event while the transition is still deferred — which
  // is precisely the blanking bug the transactions console shipped and had to
  // fix. `syncedFrom` records which server value the local state was derived
  // from, so a refresh that genuinely changes the status re-seeds it.
  const [syncedFrom, setSyncedFrom] = useState<SupportTicketStatus>(status);
  if (syncedFrom !== status) {
    setSyncedFrom(status);
    setNextStatus(status);
  }

  function fail(message: string) {
    setError(message);
    setErrorNonce((n) => n + 1);
  }

  async function send(path: string, body: unknown, kind: 'status' | 'reply', onOk: () => void) {
    setLoading(kind);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: kind === 'status' ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof parsed?.message === 'string' ? parsed.message : `Request failed (${res.status})`,
        );
      }
      onOk();
      startTransition(() => router.refresh());
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(null);
    }
  }

  const replyText = reply.trim();

  return (
    <section
      aria-labelledby={`${statusId}-heading`}
      className="space-y-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
    >
      <div className="space-y-1">
        <h2
          id={`${statusId}-heading`}
          className="text-sm font-semibold text-[var(--color-fg)]"
        >
          Respond to the recruiter
        </h2>
        {/* Stated here rather than only on the notes panel. Both halves have to
            name their audience, or "internal" on the other panel reads as a
            distinction without a stated opposite. */}
        <p className="text-sm text-[var(--color-fg-muted)]">
          Anything you send here is visible to the recruiter who raised the ticket.
        </p>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <label htmlFor={statusId} className="block text-sm font-medium text-[var(--color-fg)]">
          Status
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id={statusId}
            value={nextStatus}
            disabled={busy}
            onChange={(e) => setNextStatus(e.target.value as SupportTicketStatus)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            loading={loading === 'status'}
            disabled={busy || nextStatus === status}
            onClick={() =>
              void send(
                `/admin/support/tickets/${ticketId}`,
                { status: nextStatus },
                'status',
                () => undefined,
              )
            }
          >
            Update status
          </Button>
        </div>
      </div>

      {/* Reply */}
      <div className="space-y-2 border-t border-[var(--color-border)] pt-5">
        <label htmlFor={replyId} className="block text-sm font-medium text-[var(--color-fg)]">
          Reply to the recruiter
        </label>
        {!canReply(status) ? (
          // Mirrors the API's 409 rather than offering a control that would fail.
          <p className="text-sm text-[var(--color-fg-muted)]">
            This ticket is closed — set a status above to reopen it before replying.
          </p>
        ) : (
          <>
            <Textarea
              id={replyId}
              rows={4}
              value={reply}
              maxLength={REPLY_MAX}
              disabled={busy}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply the recruiter will see on their ticket…"
            />
            <Button
              loading={loading === 'reply'}
              disabled={busy || replyText.length === 0}
              onClick={() =>
                void send(
                  `/admin/support/tickets/${ticketId}/messages`,
                  { body: replyText },
                  'reply',
                  () => setReply(''),
                )
              }
            >
              Send reply
            </Button>
          </>
        )}
      </div>

      {error && (
        <p
          key={errorNonce}
          role="alert"
          // --color-danger as TEXT measures 4.41:1 on --color-bg-elevated, just
          // under the 4.5:1 AA floor, and PROGRESS.md carries that as a repo-wide
          // follow-up. Rendered on the muted surface with a danger-toned border
          // instead, so the error is unmissable without relying on a failing
          // foreground contrast.
          className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-muted)] px-3 py-2 text-sm text-[var(--color-fg)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
