'use client';

import { useId, useRef, useState, useTransition } from 'react';
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
import { Loader2 } from '@jobportal/ui/icons';

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
  // Bumped on every setError so the alert node REMOUNTS. Without it, pressing
  // Confirm twice with the same empty note calls setError with a string
  // identical to current state, React's Object.is bailout skips the re-render,
  // and the <p role="alert"> neither remounts nor changes text — so no alert
  // event fires and a screen-reader user gets silence on their second attempt.
  const [errorNonce, setErrorNonce] = useState(0);
  // Whether Confirm has been pressed. `noteMissing` alone is TRUE on the very
  // first render of the Dismiss dialog (open() resets the note to ''), so
  // wiring it straight to aria-invalid announces "invalid entry" to a user who
  // has typed nothing yet.
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const noteId = useId();
  const closeJobId = useId();
  const errorId = useId();

  // ONE in-flight flag covering the request AND the router.refresh() that
  // follows it. It gates every control, which is what makes the shared
  // `decision`/`error` state safe: a second action cannot start while one is
  // resolving, so a landing response can never close a dialog the admin opened
  // meanwhile or attribute a Claim failure to an Uphold.
  const busy = loading || isPending;

  const canTakeDown = takedownBlockedReason === null;
  // Dismissing overrules the reporter, so the API requires a note on that branch
  // and not on the other. Mirrored here purely to avoid a round-trip that could
  // only fail — the API enforces it regardless.
  const noteRequired = decision === 'DISMISS';
  const noteMissing = noteRequired && note.trim().length === 0;
  const showInvalid = attempted && noteMissing;

  function fail(message: string) {
    setError(message);
    setErrorNonce((n) => n + 1);
  }

  function open(next: Decision) {
    // Cleared on OPEN so a leftover failure is not mounted alongside a fresh
    // dialog, stating a stale problem before the admin has done anything.
    setError(null);
    setNote('');
    setCloseJob(false);
    setAttempted(false);
    setStatus('');
    setDecision(next);
  }

  // Cleared on CLOSE too, and that is not symmetry for its own sake: the
  // page-level alert renders on `error && decision === null`, which is the
  // Claim button's slot. Without this, cancelling a failed Uphold re-mounts its
  // message under the button row where it reads as a failure of Claim — a
  // button the admin never pressed.
  function close() {
    setDecision(null);
    setError(null);
    setAttempted(false);
  }

  async function send(body: Record<string, unknown>, done: string): Promise<void> {
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
      fail(`Could not reach the API at ${API_URL}.`);
      return;
    }
    setLoading(false);

    if (!res.ok) {
      if (res.status === 503) {
        fail('Report actions are currently switched off.');
      } else if (res.status === 401) {
        fail('Your session has expired. Sign in again.');
      } else if (res.status === 404) {
        fail('This report no longer exists.');
      } else if (res.status === 409) {
        // The API distinguishes several conflicts — already decided, already
        // claimed, the posting stopped being live, the report names no posting —
        // and each sentence is written for staff. This is the one status where
        // the server's own wording beats anything generic.
        const b = (await res.json().catch(() => null)) as { message?: unknown } | null;
        fail(
          typeof b?.message === 'string'
            ? b.message
            : 'That change conflicts with the current state of this report.',
        );
      } else {
        const b = (await res.json().catch(() => null)) as { message?: unknown } | null;
        fail(typeof b?.message === 'string' ? b.message : `Could not update (${res.status}).`);
      }
      return;
    }

    setDecision(null);
    setAttempted(false);
    // The only confirmation a screen-reader user gets. The page header's status
    // text sits in no live region, and Next's route announcer says nothing here
    // because the pathname and <title> are unchanged, so without this the
    // action completes in silence (WCAG 4.1.3).
    setStatus(done);
    // The decision rewrites the status, the resolution card and which controls
    // render, so re-render the server component in place rather than navigating.
    startTransition(() => router.refresh());
    // Claim unmounts its own button (canClaim goes false), and a decision
    // replaces this whole section — either way the focused node disappears and
    // focus silently resets to <body>. Park it on the section heading instead.
    headingRef.current?.focus();
  }

  async function onClaim() {
    await send({ action: 'CLAIM' }, 'Report claimed. It is now in review.');
  }

  async function onConfirm() {
    if (decision === null) return;
    setAttempted(true);
    if (noteMissing) {
      fail('A note is required — dismissing a report overrules the person who filed it.');
      return;
    }
    const trimmed = note.trim();
    const closing = decision === 'ACTION' && closeJob;
    await send(
      {
        action: decision,
        ...(trimmed.length > 0 ? { note: trimmed } : {}),
        // Only ever sent on the uphold branch: the API's DTO is a discriminated
        // union with .strict(), so a stray closeJob on DISMISS is a 400.
        ...(closing ? { closeJob: true } : {}),
      },
      decision === 'DISMISS'
        ? 'Report dismissed.'
        : closing
          ? 'Report upheld and the posting was closed.'
          : 'Report upheld.',
    );
  }

  const blocked = killed ? 'report actions are currently switched off' : null;

  return (
    <section
      aria-labelledby="sadmin-report-decision-heading"
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="sadmin-report-decision-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        Decision
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Upholding records that the report was correct. Dismissing records that the content was
        reviewed and found acceptable. Both are final.
      </p>

      {/* ALWAYS mounted, text-only changes. A role="status" that mounts together
          with its message is not announced — the queue page documents the same
          construction for its result summary. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {canClaim && (
          <ActionButton
            label="Claim"
            blockedReason={blocked}
            busy={busy}
            onClick={() => void onClaim()}
          />
        )}
        <ActionButton
          label="Uphold"
          blockedReason={blocked}
          busy={busy}
          onClick={() => open('ACTION')}
        />
        <ActionButton
          label="Dismiss"
          blockedReason={blocked}
          busy={busy}
          onClick={() => open('DISMISS')}
          danger
        />
      </div>

      {/* Errors from Claim, which has no dialog to host them. `close()` clears
          the error, so a dialog failure can never surface here. */}
      {error && decision === null && (
        <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {killed && (
        <p aria-hidden="true" className="text-sm text-[var(--color-fg-muted)]">
          Report actions are switched off. The queue stays readable.
        </p>
      )}

      <Dialog open={decision !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'DISMISS' ? 'Dismiss this report?' : 'Uphold this report?'}
            </DialogTitle>
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
                      // that changes something outside the report.
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
                // The component's own prop, not a raw aria-invalid spread: this
                // is what moves the red border and the ARIA state together. A
                // bare spread sets the ARIA state only, so the field announces
                // as invalid with no visual counterpart for sighted users.
                invalid={showInvalid}
                {...(noteRequired ? { 'aria-required': true } : {})}
                aria-describedby={
                  showInvalid ? `${noteId}-hint ${errorId}` : `${noteId}-hint`
                }
              />
              <p id={`${noteId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
                {noteRequired
                  ? 'Required — dismissing overrules the person who filed the report. Recorded in the audit log against your account.'
                  : 'Recorded in the audit log against your account.'}
              </p>
            </div>
          </div>

          {error && (
            <p
              key={errorNonce}
              id={errorId}
              role="alert"
              className="text-sm text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={decision === 'DISMISS' ? 'danger' : 'primary'}
              loading={busy}
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

// aria-disabled rather than the `disabled` attribute for a BLOCKED control, for
// the reason spelled out in DeleteJobPostingButton: `disabled` drops the control
// out of the tab order, so a keyboard user cannot reach it and never learns why
// it is unavailable.
//
// `busy` is the opposite case and is treated the opposite way. It is transient
// pending state rather than a permanent block, so it takes the native
// `disabled` — the same trade @jobportal/ui's own Button makes
// (`isDisabled = disabled || loading`). Without it Claim, which is the only
// control here that fires a mutation with no dialog in front of it, stays
// clickable through its own round trip: a second click races the first, loses,
// and answers the admin's successful claim with a red 409.
function ActionButton({
  label,
  onClick,
  blockedReason,
  danger = false,
  busy = false,
}: {
  label: string;
  onClick: () => void;
  blockedReason: string | null;
  danger?: boolean;
  busy?: boolean;
}) {
  const blocked = blockedReason !== null;
  return (
    <button
      type="button"
      onClick={blocked || busy ? undefined : onClick}
      disabled={busy || undefined}
      aria-disabled={blocked || undefined}
      aria-busy={busy || undefined}
      aria-label={blocked ? `${label} — ${blockedReason}` : label}
      {...(blocked ? { title: blockedReason } : {})}
      className={
        blocked
          ? 'cursor-not-allowed rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
          : `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed ${
              danger
                ? 'border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)]'
                : 'border-[var(--color-border-strong)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]'
            }`
      }
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {label}
    </button>
  );
}
