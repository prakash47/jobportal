'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** The maximum the API's DTO accepts. Mirrored so the box cannot overrun it. */
const NOTE_MAX = 500;

type Decision = 'ACTION' | 'DISMISS';

/**
 * Claim / Uphold / Dismiss for one content report, plus the optional takedown.
 *
 * Writes go through apps/api — never a server action or a Prisma call in the RSC
 * — so AdminGuard, the killswitch, the compare-and-swap on the report's status
 * and both audit rows all apply, and so a takedown actually de-indexes the
 * posting from Elasticsearch. lib/reports/queries.ts states the same rule from
 * the read side.
 *
 * ⚠ The access_token cookie is HttpOnly and set on the sadmin origin, while the
 * API is a different origin — so these fetches MUST send credentials explicitly.
 * `credentials: 'include'` is what carries it; without it the call arrives
 * unauthenticated and AdminGuard 401s.
 *
 * This renders on the DETAIL page only. Deciding a report means reading what the
 * reporter actually wrote, and inline row actions on the queue would invite
 * ruling on a posting nobody has opened.
 */
export function ReportDecisionForm({
  reportId,
  canClaim,
  jobTitle,
  takedownBlockedReason,
  killed,
}: {
  reportId: number;
  /** True only while the report is OPEN — claiming a REVIEWING row is a no-op. */
  canClaim: boolean;
  /** Null when the report names no posting. Used only for the confirm copy. */
  jobTitle: string | null;
  /** Non-null when the posting cannot be closed — see takedownBlockedReason. */
  takedownBlockedReason: string | null;
  /** True when killswitch.admin_report_write is ON (the L2 half of the gate). */
  killed: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [closeJob, setCloseJob] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const noteId = useId();
  const closeJobId = useId();

  const canTakeDown = takedownBlockedReason === null;
  // Dismissing overrules the reporter, so the API requires a note on that branch
  // and not on the other. Mirrored here purely to avoid a round-trip that could
  // only fail — the API enforces it regardless.
  const noteRequired = decision === 'DISMISS';
  const noteMissing = noteRequired && note.trim().length === 0;

  function open(next: Decision) {
    // Cleared on OPEN, not on close: a 409 left over from a previous attempt
    // would otherwise mount together with the dialog, stating a stale failure
    // before the admin has done anything — and because <p role="alert"> mounts
    // WITH its text rather than changing it, that stale message is never
    // re-announced either, so it silently misinforms a sighted user and is
    // invisible to a screen-reader one.
    setError(null);
    setNote('');
    setCloseJob(false);
    setDecision(next);
  }

  async function send(body: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/admin/reports/${reportId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setLoading(false);
      // fetch only rejects on a transport failure. Naming the URL turns
      // "something went wrong" into an actionable message during local
      // development, matching what lib/admin-api.ts does for the same case.
      setError(`Could not reach the API at ${API_URL}.`);
      return false;
    }
    setLoading(false);

    if (!res.ok) {
      if (res.status === 503) {
        setError('Report actions are currently switched off.');
      } else if (res.status === 401) {
        setError('Your session has expired. Sign in again.');
      } else if (res.status === 404) {
        setError('This report no longer exists.');
      } else if (res.status === 409) {
        // The API distinguishes several conflicts — already decided, already
        // claimed, the posting stopped being live, the report names no posting —
        // and each sentence is written for staff. This is the one status where
        // the server's own wording beats anything generic.
        const b = (await res.json().catch(() => null)) as { message?: unknown } | null;
        setError(
          typeof b?.message === 'string'
            ? b.message
            : 'That change conflicts with the current state of this report.',
        );
      } else {
        const b = (await res.json().catch(() => null)) as { message?: unknown } | null;
        setError(typeof b?.message === 'string' ? b.message : `Could not update (${res.status}).`);
      }
      return false;
    }

    setDecision(null);
    // The decision rewrites the status, the resolution card and which controls
    // render, so re-render the server component in place rather than navigating.
    startTransition(() => router.refresh());
    return true;
  }

  async function onClaim() {
    await send({ action: 'CLAIM' });
  }

  async function onConfirm() {
    if (decision === null) return;
    if (noteMissing) {
      setError('A note is required — dismissing a report overrules the person who filed it.');
      return;
    }
    const trimmed = note.trim();
    await send({
      action: decision,
      ...(trimmed.length > 0 ? { note: trimmed } : {}),
      // Only ever sent on the uphold branch: the API's DTO is a discriminated
      // union with .strict(), so a stray closeJob on DISMISS is a 400.
      ...(decision === 'ACTION' && closeJob ? { closeJob: true } : {}),
    });
  }

  const blocked = killed ? 'report actions are currently switched off' : null;

  return (
    <section
      aria-labelledby="sadmin-report-decision-heading"
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="sadmin-report-decision-heading"
        className="text-sm font-semibold text-[var(--color-fg)]"
      >
        Decision
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Upholding records that the report was correct. Dismissing records that the content was
        reviewed and found acceptable. Both are final.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {canClaim && (
          <ActionButton
            label="Claim"
            blockedReason={blocked}
            loading={loading && decision === null}
            onClick={() => void onClaim()}
          />
        )}
        <ActionButton label="Uphold" blockedReason={blocked} onClick={() => open('ACTION')} />
        <ActionButton
          label="Dismiss"
          blockedReason={blocked}
          onClick={() => open('DISMISS')}
          danger
        />
      </div>

      {/* Errors from Claim, which has no dialog to host them. */}
      {error && decision === null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {killed && (
        <p aria-hidden="true" className="text-sm text-[var(--color-fg-muted)]">
          Report actions are switched off. The queue stays readable.
        </p>
      )}

      <Dialog open={decision !== null} onOpenChange={(next) => !next && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === 'DISMISS' ? 'Dismiss this report?' : 'Uphold this report?'}</DialogTitle>
            <DialogDescription>
              {decision === 'DISMISS'
                ? 'Records that the content was reviewed and found acceptable. The posting is left exactly as it is, and the person who filed the report is not notified.'
                : 'Records that the report was correct. Closing the posting is optional and separate — upholding on its own changes nothing about the job.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {decision === 'ACTION' && (
              <div className="space-y-1.5">
                <span className="flex items-center gap-2">
                  <Checkbox
                    id={closeJobId}
                    checked={closeJob}
                    onCheckedChange={(v) => setCloseJob(v === true)}
                    disabled={!canTakeDown}
                    aria-describedby={`${closeJobId}-hint`}
                  />
                  <Label htmlFor={closeJobId}>Close the posting as well</Label>
                </span>
                <p id={`${closeJobId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
                  {canTakeDown
                    ? // Says what it does, not what it sounds like. CLOSED jobs stay
                      // readable at their own URL by design (isPubliclyReadable
                      // includes them) — claiming "removes the posting" would be a
                      // lie a moderator could repeat to a complainant.
                      //
                      // Names the posting, because this is the one control here
                      // that changes something outside the report, and the job
                      // title is the only thing distinguishing it from every other
                      // report in the queue.
                      `Sets ${jobTitle ? `“${jobTitle}”` : 'the job'} to Closed, removes it from search and job alerts, and marks its page noindex. The page itself stays reachable at its URL, and the employer can reopen it.`
                    : `Unavailable — ${takedownBlockedReason}.`}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={noteId}>Note{noteRequired ? '' : ' (optional)'}</Label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                placeholder={
                  decision === 'DISMISS'
                    ? 'Why is this posting acceptable?'
                    : 'What did you find? (optional)'
                }
                aria-describedby={`${noteId}-hint`}
                {...(noteMissing ? { 'aria-invalid': true } : {})}
              />
              <p id={`${noteId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
                {noteRequired
                  ? 'Required — dismissing overrules the person who filed the report. Recorded in the audit log against your account.'
                  : 'Recorded in the audit log against your account.'}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={decision === 'DISMISS' ? 'danger' : 'primary'}
              loading={loading}
              onClick={() => void onConfirm()}
            >
              {decision === 'DISMISS'
                ? 'Dismiss report'
                : closeJob
                  ? 'Uphold and close posting'
                  : 'Uphold report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// aria-disabled rather than the `disabled` attribute, for the reason spelled out
// in DeleteJobPostingButton: `disabled` drops the control out of the tab order,
// so a keyboard user cannot reach it and never learns why it is unavailable.
//
// The danger tone is earned only when the action can actually happen — a red
// control that refuses to fire promises something false.
function ActionButton({
  label,
  onClick,
  blockedReason,
  danger = false,
  loading = false,
}: {
  label: string;
  onClick: () => void;
  blockedReason: string | null;
  danger?: boolean;
  loading?: boolean;
}) {
  const disabled = blockedReason !== null;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      aria-label={disabled ? `${label} — ${blockedReason}` : label}
      {...(disabled ? { title: blockedReason } : {})}
      className={
        disabled
          ? 'cursor-not-allowed rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
          : `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
              danger
                ? 'border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)]'
                : 'border-[var(--color-border-strong)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]'
            }`
      }
    >
      {label}
    </button>
  );
}
