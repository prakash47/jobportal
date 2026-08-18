'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@jobportal/ui';
// EyeOff rather than a padlock: the promise this panel makes is "the recruiter
// cannot SEE this", not "this is encrypted". The icons barrel exports no Lock
// anyway, and adding one to say something less precise is the wrong trade.
import { EyeOff } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The maximum the API's AddNoteDto accepts. Mirrored so the box cannot overrun it. */
const NOTE_MAX = 5000;

/**
 * Add a staff-only note to a ticket.
 *
 * ⚠ THE ENTIRE POINT OF THIS COMPONENT IS THAT ITS TEXT IS NEVER SEEN BY THE
 * RECRUITER, so the design job is to make that impossible to forget. A note goes
 * to SupportTicketNote — a different table from the reply thread — and the API
 * deliberately fires no notification, changes no status and does not touch
 * `updatedAt`, so nothing about writing one is visible from the recruiter's side.
 *
 * Three things carry that promise visually, and none is decorative:
 *  - its OWN panel with its own heading, not a third field inside the reply card;
 *  - a lock glyph plus the words "Staff only" in the heading row;
 *  - the audience restated next to the button, where the eye is at the moment of
 *    submitting rather than only at the top of the panel.
 *
 * Writes go through apps/api so AdminGuard and the SUPPORT_TICKET_NOTE_ADDED
 * audit row apply. `credentials: 'include'` is required — the access_token
 * cookie is HttpOnly and the API is a different origin.
 */
export function InternalNoteForm({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Remount key for the alert — an identical second failure otherwise hits
  // React's Object.is bailout and announces nothing. See SupportTicketActions.
  const [errorNonce, setErrorNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  // The only confirmation a screen-reader user gets that the note saved. The
  // notes list and its count line are re-rendered by router.refresh() into plain
  // elements in no live region, and the route announcer says nothing because the
  // pathname and <title> are unchanged — so without this, adding a note
  // completes in total silence (WCAG 4.1.3). Same construction as
  // ReportDecisionForm, which documents the identical requirement.
  const [status, setStatus] = useState('');

  const noteId = useId();
  const headingId = useId();

  // Covers the request AND the router.refresh() that follows, so the box cannot
  // be re-submitted into a duplicate note while the list is still re-rendering.
  const busy = loading || isPending;
  const text = body.trim();

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${ticketId}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof parsed?.message === 'string' ? parsed.message : `Request failed (${res.status})`,
        );
      }
      // Cleared only on success. A failed submit keeps the text in the box —
      // losing a paragraph a staff member just wrote because the API blipped is
      // its own bug, and there is no draft store to recover it from.
      setBody('');
      // Names the audience again, because this is the sentence that confirms
      // what was just committed and "note added" alone would not say who can
      // read it.
      setStatus('Internal note added. Visible to staff only.');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note. Try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      // A dashed border, deliberately: every other card in this console is
      // solid, so the notes panel reads as a different kind of surface at a
      // glance rather than as another field of the reply form above it.
      className="space-y-4 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] p-6"
    >
      <div className="space-y-1">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
          <EyeOff aria-hidden className="size-4 text-[var(--color-fg-muted)]" />
          Internal notes
          <span className="rounded-full bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-fg-muted)] ring-1 ring-inset ring-[var(--color-border)]">
            Staff only
          </span>
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Working notes for whoever picks this ticket up next. The recruiter never sees these, and
          adding one does not notify them or change the ticket&apos;s status.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={noteId} className="sr-only">
          Internal note — visible to staff only
        </label>
        <Textarea
          id={noteId}
          rows={3}
          value={body}
          maxLength={NOTE_MAX}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Called the recruiter — refund already promised, waiting on finance."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={loading}
            disabled={busy || text.length === 0}
            onClick={() => void submit()}
          >
            Add note
          </Button>
          {/* Restated at the button rather than only in the panel heading: this
              is where the eye is at the moment of committing the text. */}
          <span className="text-xs text-[var(--color-fg-muted)]">Not visible to the recruiter.</span>
        </div>
      </div>

      {/* ALWAYS mounted, text-only changes. A role="status" that mounts together
          with its message is not announced — the queue page documents the same
          construction for its result summary. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {error && (
        <p
          key={errorNonce}
          role="alert"
          className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-fg)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
